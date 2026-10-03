import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

// We assume these services are built as discussed
// import { BillProSpeechEngine } from '../services/billProSpeechEngine';
// import { BillProInputEngine } from '../services/billProInputEngine';

type DeviceClass = 'Class_A' | 'Class_B' | 'Class_C';

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
    // const speechEngineRef = useRef<BillProSpeechEngine | null>(null);
    // const inputEngineRef = useRef<BillProInputEngine | null>(null);

    const toggleAi = () => setIsOpen(prev => !prev);

    // 1. Hardware Profile Detection (Class A, B, C)
    useEffect(() => {
        const detectHardwareProfile = async () => {
            const hasDisplay = window.matchMedia('(min-width: 320px)').matches;
            let hasAudioInput = false;
            let hasAudioOutput = !!(window.AudioContext || (window as any).webkitAudioContext);
            
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                hasAudioInput = devices.some(device => device.kind === 'audioinput');
            } catch (e) {
                console.warn("Media permissions restricted or device lacks mic infrastructure.");
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

    // 2. Local STT & TTS Initialization
    const startSession = async () => {
        if (!user || !dbUser || !capabilities) return;
        
        setStatus('idle');
        setAvatarState('idle');

        // Initialize Engines (Conceptual mapping, ensuring architecture is solid)
        /*
        if (!speechEngineRef.current) {
            speechEngineRef.current = new BillProSpeechEngine();
        }
        if (!inputEngineRef.current) {
            inputEngineRef.current = new BillProInputEngine();
            inputEngineRef.current.setLanguage('en-IN'); // Support ta-IN
        }
        
        // Start passive listening loop
        inputEngineRef.current.listen((text, intent) => {
            setTranscript(text);
            if (intent.intent !== 'UNKNOWN') {
                // Local edge execution bypasses LLM
                console.log("Local execution intent:", intent);
                // navigate or execute local state update
            } else {
                // Unknown command, send delta to API
                sendText(text);
            }
        });
        */
    };

    const stopSession = () => {
        // speechEngineRef.current?.stop();
        // inputEngineRef.current?.stop();
        setStatus('disconnected');
        setAvatarState('idle');
        setVolumeLevel(0);
    };

    // 3. Centralized API Dispatcher for onBlur JSON Deltas
    const dispatchAudit = async (fieldId: string, snapshotPayload: any) => {
        if (!capabilities) return;
        setStatus('working');
        setAvatarState('thinking');

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

            // Call token-monitoring middleware
            const response = await gateway({ promptPayload });
            const data = response.data as any;

            if (data.success && data.text) {
                try {
                    // Try parsing the structured LLM response
                    const parsed = JSON.parse(data.text);
                    if (parsed.status === "AUDIT_FAILED") {
                        setAvatarState(parsed.avatarState || 'warning');
                        setSeverity(parsed.severity || 'MEDIUM');
                        setAiResponse(parsed.voiceAlertText);
                        
                        // Fire local TTS
                        /*
                        speechEngineRef.current?.speak(parsed.voiceAlertText, (volData) => {
                            setVolumeLevel(volData.audioVolume);
                            if (!volData.isSpeaking) {
                                setAvatarState('idle');
                            }
                        });
                        */
                    } else {
                        setAvatarState('idle');
                    }
                } catch (e) {
                    // Fallback if not strict JSON
                    setAiResponse(data.text);
                    setAvatarState('idle');
                }
            } else {
                setAvatarState('idle');
            }
        } catch (error) {
            console.error("Audit dispatch failed:", error);
            setStatus('error');
            setAvatarState('idle');
        } finally {
            setStatus('idle');
        }
    };

    const sendText = (text: string) => {
        setTranscript(text);
        // Instead of WebRTC, we use our delta API gateway for text queries as well
        dispatchAudit('txt_global_input', { query: text });
    };

    const confirmAction = async () => {
        setPendingAction(null);
    };

    const cancelAction = () => {
        setPendingAction(null);
        setStatus('idle');
        setAiResponse('Action cancelled.');
    };

    // Cleanup
    useEffect(() => {
        return () => stopSession();
    }, []);

    return (
        <AiContext.Provider value={{
            isOpen, setIsOpen, toggleAi,
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
