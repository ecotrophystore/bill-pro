import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";

export interface RealtimeConfig {
    onMessage: (event: any) => void;
    onStatusChange: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
    onError: (error: any) => void;
    systemInstruction: string;
    tools: any[];
    onVolumeChange?: (volume: number) => void;
}

export class GeminiLiveWebRTC {
    private ws: WebSocket | null = null;
    private config: RealtimeConfig;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioProcessor: ScriptProcessorNode | null = null;
    private isConnected: boolean = false;
    private isSpeaking: boolean = false;
    private silenceTimer: any = null;

    constructor(config: RealtimeConfig) {
        this.config = config;
        // MUST be created synchronously during user interaction to avoid 'suspended' state
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: 16000 });
    }

    public async connect() {
        this.config.onStatusChange('connecting');

        try {
            // 1. Get Temporary Access Token from Firebase Cloud Functions
            const functions = getFunctions(app, 'us-central1');
            const getGeminiToken = httpsCallable(functions, 'getGeminiLiveEphemeralToken');

            const response = await getGeminiToken();
            const data = response.data as { token: string, url: string };
            const { token, url } = data;

            if (!token || !url) {
                throw new Error("Failed to retrieve Gemini Live ephemeral token from gateway.");
            }

            console.log("[GEMINI_DIAGNOSTICS] Token retrieved:", { tokenLength: token?.length, url });
            console.log("[GEMINI_DIAGNOSTICS] Initializing WebSocket connection to Gemini Live...");

            const wsUrl = new URL(url);
            wsUrl.searchParams.append("access_token", token);

            console.log("[GEMINI_DIAGNOSTICS] Connecting to URL:", wsUrl.toString().replace(token, "[HIDDEN_TOKEN]"));

            this.ws = new WebSocket(wsUrl.toString());

            this.ws.onopen = async () => {
                console.log("[GEMINI_DIAGNOSTICS] WebSocket CONNECTED.");
                this.isConnected = true;
                this.config.onStatusChange('connected');

                // Send Initial Setup
                this.updateSession();

                // Setup Microphone
                await this.setupMicrophone();
            };

            this.ws.onmessage = async (event) => {
                try {
                    let data = event.data;
                    if (data instanceof Blob) {
                        data = await data.text();
                    } else if (data instanceof ArrayBuffer) {
                        const decoder = new TextDecoder('utf-8');
                        data = decoder.decode(data);
                    }

                    const message = JSON.parse(data);
                    console.log("[GEMINI_DIAGNOSTICS] Incoming message keys:", Object.keys(message));
                    if (message.setupComplete) {
                        console.log("[GEMINI_DIAGNOSTICS] setupComplete acknowledgement received from Gemini.");
                    }
                    this.handleIncomingMessage(message);
                } catch (err) {
                    console.error("[GEMINI_DIAGNOSTICS] Error parsing message:", err);
                }
            };

            this.ws.onerror = (e) => {
                console.error("[GEMINI_DIAGNOSTICS] WebSocket ERROR:", e);
                this.config.onError(e);
            };

            this.ws.onclose = (event) => {
                console.log(`[GEMINI_DIAGNOSTICS] WebSocket CLOSED. Code: ${event.code}, Reason: ${event.reason}`);
                this.disconnect();
            };

        } catch (err: any) {
            console.error("Gemini Live Connection Error:", err);
            this.config.onStatusChange('error');
            this.config.onError(err);
            this.disconnect();
        }
    }

    private updateSession() {
        if (!this.ws || !this.isConnected) return;

        const setupMessage = {
            setup: {
                model: "models/gemini-3.8-live",
                generationConfig: {
                    responseModalities: ["AUDIO"],
                },
                systemInstruction: {
                    parts: [{ text: this.config.systemInstruction }]
                },
                tools: [{ functionDeclarations: this.config.tools }]
            }
        };

        console.log("[GEMINI_DIAGNOSTICS] Sending setup message to Gemini:", JSON.stringify(setupMessage).substring(0, 200) + "...");
        this.ws.send(JSON.stringify(setupMessage));
    }

    private async setupMicrophone() {
        console.log("[GEMINI_DIAGNOSTICS] Requesting microphone permission...");
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            console.log("[GEMINI_DIAGNOSTICS] Microphone permission GRANTED.");

            // Fix race condition: if connection closed while waiting for mic permissions, audioContext might be null
            if (!this.audioContext || !this.isConnected) {
                console.log("[GEMINI_DIAGNOSTICS] Connection closed during mic setup, aborting.");
                return;
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Using ScriptProcessorNode for wide compatibility, though AudioWorklet is preferred
            this.audioProcessor = this.audioContext!.createScriptProcessor(4096, 1, 1);

            this.audioProcessor.onaudioprocess = (e) => {
                if (!this.isConnected || !this.ws) return;

                const inputData = e.inputBuffer.getChannelData(0);
                const outputData = e.outputBuffer.getChannelData(0);

                // Gemini strictly requires 16000Hz. If browser is 48000Hz or 44100Hz, we MUST downsample!
                const sampleRate = this.audioContext!.sampleRate;
                const downsampleRatio = sampleRate / 16000;
                const downsampledLength = Math.round(inputData.length / downsampleRatio);
                const pcm16 = new Int16Array(downsampledLength);
                
                const isAiSpeaking = this.audioContext!.currentTime < this.nextPlaybackTime + 0.5; // add 500ms padding

                let maxAmplitude = 0;
                for (let i = 0; i < downsampledLength; i++) {
                    const exactSrcIndex = i * downsampleRatio;
                    const index1 = Math.floor(exactSrcIndex);
                    const index2 = Math.min(index1 + 1, inputData.length - 1);
                    const fraction = exactSrcIndex - index1;
                    
                    const sample1 = inputData[index1] || 0;
                    const sample2 = inputData[index2] || 0;
                    
                    const interpolatedSample = isAiSpeaking ? 0 : (sample1 + (sample2 - sample1) * fraction);
                    
                    const abs = Math.abs(interpolatedSample);
                    if (abs > maxAmplitude) maxAmplitude = abs;

                    const s = Math.max(-1, Math.min(1, interpolatedSample));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                if (this.config.onVolumeChange) {
                    this.config.onVolumeChange(maxAmplitude);
                }

                // INTELLIGENT CLIENT VAD:
                // If AI is talking, cancel any active silence timers and reset state.
                if (isAiSpeaking) {
                    this.isSpeaking = false;
                    if (this.silenceTimer) clearTimeout(this.silenceTimer);
                } else if (maxAmplitude > 0.03) {
                    this.isSpeaking = true;
                    if (this.silenceTimer) clearTimeout(this.silenceTimer);
                    
                    this.silenceTimer = setTimeout(() => {
                        this.isSpeaking = false;
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            console.log("[GEMINI_DIAGNOSTICS] Client VAD detected silence. Sending turnComplete!");
                            this.ws.send(JSON.stringify({
                                clientContent: { turnComplete: true }
                            }));
                        }
                    }, 1500); // 1.5 seconds of silence triggers response
                }

                // Mute speakers to prevent echo feedback loop
                for (let i = 0; i < outputData.length; i++) {
                    outputData[i] = 0; 
                }

                // Base64 encode safely
                const uint8Array = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < uint8Array.byteLength; i++) {
                    binary += String.fromCharCode(uint8Array[i]);
                }
                const base64Audio = btoa(binary);

                // Throttle logging to every ~20 chunks to avoid console spam
                if (Math.random() < 0.05) {
                    console.log("[GEMINI_DIAGNOSTICS] Sending microphone audio chunk...");
                }

                this.ws.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{
                            mimeType: "audio/pcm;rate=16000",
                            data: base64Audio
                        }]
                    }
                }));
            };

            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext!.destination);

        } catch (e) {
            console.error("[GEMINI_DIAGNOSTICS] Microphone permission FAILED or setup error:", e);
            console.error("Microphone setup failed:", e);
            this.config.onError(e);
        }
    }

    private handleIncomingMessage(message: any) {
        if (message.toolCall) {
            console.log("[GEMINI_DIAGNOSTICS] Received toolCall at root:", message.toolCall);
            const calls = message.toolCall.functionCalls;
            if (calls && calls.length > 0) {
                for (const call of calls) {
                    this.config.onMessage({
                        type: "function_call",
                        call_id: call.id,
                        name: call.name,
                        arguments: JSON.stringify(call.args)
                    });
                }
            }
        }

        if (message.serverContent) {
            console.log("[GEMINI_DIAGNOSTICS] Received serverContent:", JSON.stringify(message.serverContent).substring(0, 500));
        }

        if (message.serverContent?.modelTurn) {
            const parts = message.serverContent.modelTurn.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.text) {
                        console.log("[GEMINI_DIAGNOSTICS] Received transcript:", part.text);
                        this.config.onMessage({ type: "transcript", text: part.text });
                    }
                    if (part.inlineData) {
                        console.log("[GEMINI_DIAGNOSTICS] Received audio response chunk.");
                        this.playAudio(part.inlineData.data);
                    }
                }
            }
        }

        // Handle Interruption / Turn Complete
        if (message.serverContent?.turnComplete) {
            console.log("[GEMINI_DIAGNOSTICS] Received turnComplete");
            this.config.onMessage({ type: "turn_complete" });
        }
    }

    private nextPlaybackTime: number = 0;

    private playAudio(base64Data: string) {
        if (!this.audioContext) return;

        try {
            // Decode base64 to binary string
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Gemini outputs raw PCM 16-bit at 24000Hz
            const int16Array = new Int16Array(bytes.buffer);
            const audioBuffer = this.audioContext.createBuffer(1, int16Array.length, 24000);
            const channelData = audioBuffer.getChannelData(0);

            for (let i = 0; i < int16Array.length; i++) {
                channelData[i] = int16Array[i] / 32768.0;
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);

            // Schedule playback smoothly to prevent choppy robotic audio
            const currentTime = this.audioContext.currentTime;
            if (this.nextPlaybackTime < currentTime) {
                this.nextPlaybackTime = currentTime; // Reset if we fell behind
            }

            source.start(this.nextPlaybackTime);
            this.nextPlaybackTime += audioBuffer.duration;

            this.config.onMessage({ type: "speaking_started" });
        } catch (e) {
            console.error("Audio playback error", e);
        }
    }

    public sendText(text: string) {
        if (!this.ws || !this.isConnected) return;

        console.log("[GEMINI_DIAGNOSTICS] Sending text message:", text);
        const message = {
            clientContent: {
                turns: [{
                    role: "user",
                    parts: [{ text: text }]
                }],
                turnComplete: true
            }
        };
        this.ws.send(JSON.stringify(message));
    }

    public sendToolResult(callId: string, name: string, output: string) {
        if (!this.ws || !this.isConnected) return;

        let parsedOutput: any = {};
        try {
            parsedOutput = JSON.parse(output);
            if (typeof parsedOutput !== "object" || Array.isArray(parsedOutput) || parsedOutput === null) {
                parsedOutput = { result: parsedOutput };
            }
        } catch (e) {
            parsedOutput = { error: output };
        }

        console.log("[GEMINI_DIAGNOSTICS] Sending tool response back to Gemini for callId:", callId, "response snippet:", JSON.stringify(parsedOutput).substring(0, 50));

        const message = {
            toolResponse: {
                functionResponses: [{
                    id: callId,
                    name: name,
                    response: parsedOutput
                }]
            }
        };
        this.ws.send(JSON.stringify(message));
    }


    public disconnect() {
        this.isConnected = false;
        if (this.audioProcessor) {
            this.audioProcessor.disconnect();
            this.audioProcessor = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.config.onStatusChange('disconnected');
    }
}
