import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BillProSpeechEngine } from '../services/billProSpeechEngine';
import { BillProInputEngine } from '../services/billProInputEngine';

type DeviceClass = 'Class_A' | 'Class_B' | 'Class_C';
type InteractionMode = 'voice' | 'text' | 'both';

interface DeviceCapabilities {
    deviceClass: DeviceClass;
    hasAudioInput: boolean;
    hasAudioOutput: boolean;
    hasDisplay: boolean;
}

interface PendingAction {
    id: string;
    toolName: string;
    args: any;
    summary: string;
}

interface AiContextType {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    toggleAi: () => void;
    
    // UI/UX Mode
    interactionMode: InteractionMode;
    setInteractionMode: (mode: InteractionMode) => void;

    // Core states
    status: 'disconnected' | 'connecting' | 'idle' | 'listening' | 'understanding' | 'working' | 'waiting_for_confirmation' | 'speaking' | 'error';
    setStatus: (status: AiContextType['status']) => void;
    
    // Rive Avatar states
    avatarState: 'idle' | 'thinking' | 'warning' | 'celebrating';
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    volumeLevel: number; // 0-100 for lip sync

    // Data tracking
    transcript: string;
    setTranscript: (text: string) => void;
    aiResponse: string;
    setAiResponse: (text: string) => void;
    pendingAction: PendingAction | null;
    
    // Device & Architecture hooks
    capabilities: DeviceCapabilities | null;
    activeAuditThread: any | null;
    
    // Methods
    confirmAction: () => void;
    cancelAction: () => void;
    startSession: () => Promise<void>;
    stopSession: () => void;
    sendText: (text: string) => void;
    dispatchAudit: (fieldId: string, payload: any) => Promise<void>;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // UI toggles
    const [isOpen, setIsOpen] = useState(false);
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('both');
    
    // Unified State Management
    const [status, setStatus] = useState<AiContextType['status']>('disconnected');
    const [avatarState, setAvatarState] = useState<AiContextType['avatarState']>('idle');
    const [severity, setSeverity] = useState<AiContextType['severity']>('LOW');
    const [volumeLevel, setVolumeLevel] = useState(0);

    const [transcript, setTranscript] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    // Cross-Device Architecture 
    const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
    const [activeAuditThread, setActiveAuditThread] = useState<any | null>(null);

    const { user, dbUser } = useAuth();
    const navigate = useNavigate();

    // Engine Refs
    const speechEngineRef = useRef<BillProSpeechEngine | null>(null);
    const inputEngineRef = useRef<BillProInputEngine | null>(null);

    const toggleAi = () => setIsOpen(prev => !prev);

    // 1. Hardware Profile Detection
    useEffect(() => {
        const detectHardwareProfile = async () => {
            const hasDisplay = window.matchMedia('(min-width: 320px)').matches;
            let hasAudioInput = false;
            let hasAudioOutput = !!(window.AudioContext || (window as any).webkitAudioContext);
            
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                hasAudioInput = devices.some(device => device.kind === 'audioinput');
            } catch (e) {
                console.warn("Media permissions restricted.");
            }

            let deviceClass: DeviceClass = 'Class_C';
            if (hasDisplay && hasAudioInput && hasAudioOutput) {
                deviceClass = 'Class_A'; 
            } else if (!hasDisplay && hasAudioInput && hasAudioOutput) {
                deviceClass = 'Class_B'; 
            }

            setCapabilities({ deviceClass, hasAudioInput, hasAudioOutput, hasDisplay });
        };
        detectHardwareProfile();
    }, []);

    // Helper to conditionally speak based on interaction mode
    const conditionalSpeak = (text: string) => {
        if (interactionMode === 'voice' || interactionMode === 'both') {
            setStatus('speaking');
            speechEngineRef.current?.speak(text, (volData) => {
                setVolumeLevel(volData.audioVolume);
                if (!volData.isSpeaking) {
                    setAvatarState('idle');
                    setStatus('idle');
                    // Restart listening if mode is voice
                    if (interactionMode === 'voice' || interactionMode === 'both') {
                        startListeningLoop();
                    }
                }
            });
        }
    };

    const startListeningLoop = () => {
        if (!inputEngineRef.current) return;
        if (interactionMode === 'voice' || interactionMode === 'both') {
            inputEngineRef.current.listen((text, intent) => {
                setTranscript(text);
                if (intent.intent !== 'UNKNOWN') {
                    // Local edge execution bypasses LLM
                    console.log("Local execution intent:", intent);
                    setAiResponse(`Executed local command: ${intent.intent}`);
                } else {
                    // Unknown command, send delta to API
                    sendText(text);
                }
            }, (err) => {
                if (err !== 'no-speech') {
                    console.error("Listening error:", err);
                }
            });
        }
    };

    // 2. Local STT & TTS Initialization
    const startSession = async () => {
        if (!user || !dbUser || !capabilities) return;
        
        setStatus('idle');
        setAvatarState('idle');

        if (!speechEngineRef.current) {
            speechEngineRef.current = new BillProSpeechEngine();
        }
        if (!inputEngineRef.current) {
            inputEngineRef.current = new BillProInputEngine();
            inputEngineRef.current.setLanguage('en-IN'); 
        }
        
        startListeningLoop();
    };

    const stopSession = () => {
        speechEngineRef.current?.stop();
        inputEngineRef.current?.stop();
        setStatus('disconnected');
        setAvatarState('idle');
        setVolumeLevel(0);
    };

    // 3. Centralized API Dispatcher
    const dispatchAudit = async (fieldId: string, snapshotPayload: any) => {
        if (!capabilities) return;
        setStatus('working');
        setAvatarState('thinking');
        
        // Stop listening while thinking
        inputEngineRef.current?.stop();

        try {
            const functions = getFunctions(app, 'us-central1');
            const gateway = httpsCallable(functions, 'executeBillProAgentTask');
            
            const promptPayload = JSON.stringify({
                meta: {
                    deviceClass: capabilities.deviceClass,
                    timestamp: new Date().toISOString()
                },
                event: {
                    trigger: "onBlur",
                    fieldId: fieldId,
                    action: "PATCH_DELTA"
                },
                snapshot: snapshotPayload
            });

            const response = await gateway({ promptPayload });
            const data = response.data as any;

            if (data.success && data.text) {
                let responseText = data.text;
                let parsedObj = null;

                try {
                    parsedObj = JSON.parse(data.text);
                } catch(e) {}

                if (parsedObj && typeof parsedObj === 'object') {
                    if (parsedObj.action === "NAVIGATE" && parsedObj.target) {
                        navigate(parsedObj.target);
                        responseText = parsedObj.message || `Navigating to ${parsedObj.target}`;
                    } else if (parsedObj.action === "ADD_PRODUCT" && parsedObj.payload) {
                        // Calculate auto SKU
                        const price = parseFloat(parsedObj.payload.retail_price) || 0;
                        const generatedNum = Math.floor(price / 100) * 100 + 99;
                        const sku = `ETWA${generatedNum}`;

                        addDoc(collection(db, 'products'), {
                            name: parsedObj.payload.name || 'New Product',
                            sku: sku,
                            retail_price: price,
                            wholesale_price: price,
                            tax_percentage: 18,
                            hsn_code: '0000',
                            created_at: new Date(),
                            source: 'ai_agent'
                        }).catch(console.error);

                        responseText = parsedObj.message || `Added product ${parsedObj.payload.name}`;
                    } else if (parsedObj.action === "PREFILL_DOCUMENT" && parsedObj.target) {
                        navigate(parsedObj.target, { state: { prefillData: parsedObj.payload } });
                        responseText = parsedObj.message || `Starting new document...`;
                    } else if (parsedObj.action === "ADD_CUSTOMER" && parsedObj.payload) {
                        addDoc(collection(db, 'customers'), {
                            name: parsedObj.payload.name || 'New Customer',
                            phone: parsedObj.payload.phone || '',
                            email: parsedObj.payload.email || '',
                            gst_number: parsedObj.payload.gst_number || '',
                            billing_address: parsedObj.payload.address || '',
                            created_at: new Date(),
                            source: 'ai_agent'
                        }).catch(console.error);
                        
                        responseText = parsedObj.message || `Added customer ${parsedObj.payload.name}`;
                    } else if (parsedObj.status === "ERROR") {
                        setAvatarState(parsedObj.avatarState || 'warning');
                        setSeverity(parsedObj.severity || 'MEDIUM');
                        responseText = parsedObj.voiceAlertText || parsedObj.message || "Action failed.";
                    } else if (parsedObj.voiceAlertText || parsedObj.message) {
                        responseText = parsedObj.voiceAlertText || parsedObj.message;
                    }
                }
                
                setAiResponse(responseText);
                conditionalSpeak(responseText);

            } else {
                setAiResponse("I could not process that request.");
                conditionalSpeak("I could not process that request.");
            }
        } catch (error) {
            console.error("Audit dispatch failed:", error);
            setStatus('error');
            setAiResponse("I'm having trouble connecting to the network.");
            conditionalSpeak("I'm having trouble connecting to the network.");
        } finally {
            if (status !== 'speaking') {
                setStatus('idle');
            }
        }
    };

    const sendText = (text: string) => {
        setTranscript(text);
        dispatchAudit('txt_global_input', { query: text });
    };

    const confirmAction = async () => {
        setPendingAction(null);
    };

    const cancelAction = () => {
        setPendingAction(null);
        setStatus('idle');
        setAiResponse('Action cancelled.');
        conditionalSpeak('Action cancelled.');
    };

    // Re-trigger listening if mode changes to include voice
    useEffect(() => {
        if (status === 'idle') {
            if (interactionMode === 'voice' || interactionMode === 'both') {
                startListeningLoop();
            } else {
                inputEngineRef.current?.stop();
            }
        }
    }, [interactionMode]);

    useEffect(() => {
        return () => stopSession();
    }, []);

    return (
        <AiContext.Provider value={{
            isOpen, setIsOpen, toggleAi,
            interactionMode, setInteractionMode,
            status, setStatus,
            avatarState, severity, volumeLevel,
            transcript, setTranscript,
            aiResponse, setAiResponse,
            pendingAction, confirmAction, cancelAction,
            startSession, stopSession, sendText,
            capabilities, activeAuditThread, dispatchAudit
        }}>
            {children}
        </AiContext.Provider>
    );
};

export const useAi = () => {
    const context = useContext(AiContext);
    if (context === undefined) {
        throw new Error('useAi must be used within an AiProvider');
    }
    return context;
};
