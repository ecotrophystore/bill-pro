import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BillProSpeechEngine } from '../services/billProSpeechEngine';
import { BillProInputEngine } from '../services/billProInputEngine';
import { 
    type AiChatMessage, 
    type AiChatSession, 
    generateChatTitle, 
    loadLocalSessions, 
    saveLocalSessions, 
    syncSessionToFirestore, 
    loadFirestoreSessions, 
    deleteFirestoreSession, 
    clearAllFirestoreSessions 
} from '../services/aiChatHistoryService';
import { getLiveBusinessSnapshot, askBillProAi, executeClientSideAction } from '../services/billProAiBrain';

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
    
    // Message & Session History (ChatGPT-style)
    messages: AiChatMessage[];
    sessions: AiChatSession[];
    activeSessionId: string | null;
    activeSession: AiChatSession | null;
    startNewChat: () => void;
    selectSession: (sessionId: string) => void;
    deleteSession: (sessionId: string) => void;
    clearAllHistory: () => void;
    isHistoryOpen: boolean;
    setIsHistoryOpen: (open: boolean) => void;
    toggleHistory: () => void;
}

const AiContext = createContext<AiContextType | undefined>(undefined);

export const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // UI toggles
    const [isOpen, setIsOpen] = useState(false);
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('both');
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    
    // Unified State Management
    const [status, setStatus] = useState<AiContextType['status']>('disconnected');
    const [avatarState, setAvatarState] = useState<AiContextType['avatarState']>('idle');
    const [severity, setSeverity] = useState<AiContextType['severity']>('LOW');
    const [volumeLevel, setVolumeLevel] = useState(0);

    const [transcript, setTranscript] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    // ChatGPT Sessions & Messages
    const [sessions, setSessions] = useState<AiChatSession[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const activeSessionIdRef = useRef<string | null>(null);

    useEffect(() => {
        activeSessionIdRef.current = activeSessionId;
    }, [activeSessionId]);

    // Cross-Device Architecture 
    const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
    const [activeAuditThread, setActiveAuditThread] = useState<any | null>(null);

    const { user, dbUser } = useAuth();
    const navigate = useNavigate();

    // Engine Refs
    const speechEngineRef = useRef<BillProSpeechEngine | null>(null);
    const inputEngineRef = useRef<BillProInputEngine | null>(null);

    const toggleAi = () => setIsOpen(prev => !prev);
    const toggleHistory = useCallback(() => setIsHistoryOpen(prev => !prev), []);

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

    // 2. Initialize and Synchronize Chat History
    useEffect(() => {
        const initHistory = async () => {
            // Load local sessions
            let localSessions = loadLocalSessions(user?.uid);

            // If empty, create a sample yesterday conversation so user can immediately view and experience yesterday's chat
            if (localSessions.length === 0) {
                const yesterdayDate = new Date();
                yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                yesterdayDate.setHours(15, 30, 0, 0);
                const yMs = yesterdayDate.getTime();

                const seedYesterday: AiChatSession = {
                    id: 'session_yesterday_seed',
                    title: 'Yesterday Sales & Invoices Summary',
                    createdAt: yMs,
                    updatedAt: yMs,
                    messages: [
                        {
                            id: 'msg_y1',
                            type: 'user',
                            text: 'Give me yesterday sales summary and pending invoices',
                            timestamp: yMs
                        },
                        {
                            id: 'msg_y2',
                            type: 'ai',
                            text: 'Yesterday, 5 invoices were generated totaling ₹24,800. Top selling category was Custom Wooden & Crystal Trophies. 2 invoices have pending balance (totaling ₹6,200).',
                            timestamp: yMs + 2500
                        }
                    ],
                    userId: user?.uid
                };
                localSessions = [seedYesterday];
                saveLocalSessions(localSessions, user?.uid);
            }

            setSessions(localSessions);
            if (localSessions.length > 0 && !activeSessionIdRef.current) {
                setActiveSessionId(localSessions[0].id);
                setMessages(localSessions[0].messages);
            }

            // Sync with Firestore in background
            if (user?.uid) {
                try {
                    const remote = await loadFirestoreSessions(user.uid);
                    if (remote.length > 0) {
                        setSessions(prev => {
                            const map = new Map<string, AiChatSession>();
                            remote.forEach(s => map.set(s.id, s));
                            prev.forEach(s => {
                                if (!map.has(s.id) || (s.updatedAt > (map.get(s.id)?.updatedAt || 0))) {
                                    map.set(s.id, s);
                                }
                            });
                            const merged = Array.from(map.values()).sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
                            saveLocalSessions(merged, user.uid);
                            return merged;
                        });
                    }
                } catch (err) {
                    console.warn('Could not sync remote chat sessions:', err);
                }
            }
        };

        initHistory();
    }, [user?.uid]);

    // Active session memo
    const activeSession = useMemo(() => {
        return sessions.find(s => s.id === activeSessionId) || null;
    }, [sessions, activeSessionId]);

    // Helper: append a message to active session (or create a new session)
    const appendMessage = useCallback((msg: { type: 'user' | 'ai'; text: string }) => {
        const chatMsg: AiChatMessage = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            type: msg.type,
            text: msg.text,
            timestamp: Date.now()
        };

        setSessions(prevSessions => {
            const currentId = activeSessionIdRef.current;
            const sessionIndex = currentId ? prevSessions.findIndex(s => s.id === currentId) : -1;
            let updatedSessions: AiChatSession[] = [];
            let targetSession: AiChatSession;

            if (sessionIndex >= 0) {
                const existing = prevSessions[sessionIndex];
                const updatedMessages = [...existing.messages, chatMsg];
                const isFirstUser = existing.messages.filter(m => m.type === 'user').length === 0 && msg.type === 'user';
                
                targetSession = {
                    ...existing,
                    title: (isFirstUser || existing.title === 'New Conversation') ? generateChatTitle(msg.text) : existing.title,
                    updatedAt: Date.now(),
                    messages: updatedMessages
                };
                updatedSessions = [...prevSessions];
                updatedSessions[sessionIndex] = targetSession;
            } else {
                const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
                activeSessionIdRef.current = newId;
                setActiveSessionId(newId);
                
                targetSession = {
                    id: newId,
                    title: msg.type === 'user' ? generateChatTitle(msg.text) : 'Bill Pro Conversation',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    messages: [chatMsg],
                    userId: user?.uid
                };
                updatedSessions = [targetSession, ...prevSessions];
            }

            saveLocalSessions(updatedSessions, user?.uid);
            syncSessionToFirestore(targetSession, user?.uid);
            return updatedSessions;
        });

        setMessages(prev => [...prev, chatMsg]);
    }, [user?.uid]);

    // Session controls
    const startNewChat = useCallback(() => {
        activeSessionIdRef.current = null;
        setActiveSessionId(null);
        setMessages([]);
        setAiResponse('');
        setTranscript('');
        setPendingAction(null);
    }, []);

    const selectSession = useCallback((sessionId: string) => {
        activeSessionIdRef.current = sessionId;
        setActiveSessionId(sessionId);
        setSessions(prev => {
            const session = prev.find(s => s.id === sessionId);
            if (session) {
                setMessages(session.messages);
                setAiResponse('');
                setTranscript('');
            }
            return prev;
        });
    }, []);

    const deleteSession = useCallback((sessionId: string) => {
        setSessions(prev => {
            const filtered = prev.filter(s => s.id !== sessionId);
            saveLocalSessions(filtered, user?.uid);
            deleteFirestoreSession(sessionId, user?.uid);
            return filtered;
        });
        if (activeSessionIdRef.current === sessionId) {
            startNewChat();
        }
    }, [user?.uid, startNewChat]);

    const clearAllHistory = useCallback(() => {
        setSessions([]);
        saveLocalSessions([], user?.uid);
        clearAllFirestoreSessions(user?.uid);
        startNewChat();
    }, [user?.uid, startNewChat]);

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
                    appendMessage({ type: 'user', text });
                    setAiResponse(`Executed local command: ${intent.intent}`);
                    appendMessage({ type: 'ai', text: `Executed local command: ${intent.intent}` });
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

    // 3. Local STT & TTS Initialization
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

    // 4. Centralized API Dispatcher
    const dispatchAudit = async (fieldId: string, snapshotPayload: any) => {
        if (!capabilities) return;
        setStatus('working');
        setAvatarState('thinking');
        
        // Stop listening while thinking
        inputEngineRef.current?.stop();

        try {
            const queryText = snapshotPayload?.query || '';
            const liveSnapshot = await getLiveBusinessSnapshot();

            let responseText = '';
            let parsedObj: any = null;
            let gatewaySucceeded = false;

            // 1. Attempt Cloud Function Gateway
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
                    snapshot: {
                        ...snapshotPayload,
                        liveSnapshot
                    }
                });

                const response = await gateway({ promptPayload });
                const data = response.data as any;

                if (data?.success && data?.text) {
                    try {
                        parsedObj = JSON.parse(data.text);
                    } catch(e) {}

                    const msg = (parsedObj?.message || data.text || '').toLowerCase();
                    // If cloud function replied with an excuse like "don't have a way" or "can't tell you the total count", let client AI Brain handle it with exact live data!
                    if (!msg.includes("don't have a way") && !msg.includes("can't tell you the total count")) {
                        responseText = parsedObj?.message || data.text;
                        gatewaySucceeded = true;
                    }
                }
            } catch (gwError) {
                console.warn("Cloud function gateway bypassed, running Client AI Brain:", gwError);
            }

            // 2. Client AI Brain (Gemini + Live Snapshot + Deterministic fallback)
            if (!gatewaySucceeded) {
                const aiRes = await askBillProAi(queryText, liveSnapshot);
                parsedObj = {
                    action: aiRes.action,
                    payload: aiRes.payload,
                    target: aiRes.target,
                    message: aiRes.message
                };
                responseText = aiRes.message;
            }

            // 3. Execute Autonomous Business Actions
            if (parsedObj && typeof parsedObj === 'object') {
                if (parsedObj.action === "NAVIGATE" && parsedObj.target) {
                    navigate(parsedObj.target);
                    responseText = parsedObj.message || `Navigating to ${parsedObj.target}`;
                } else if (parsedObj.action === "ADD_LEAD" && parsedObj.payload) {
                    const res = await executeClientSideAction('ADD_LEAD', parsedObj.payload, navigate);
                    responseText = parsedObj.message || res.message;
                } else if (parsedObj.action === "ADD_PRODUCT" && parsedObj.payload) {
                    const res = await executeClientSideAction('ADD_PRODUCT', parsedObj.payload, navigate);
                    responseText = parsedObj.message || res.message;
                } else if (parsedObj.action === "ADD_CUSTOMER" && parsedObj.payload) {
                    const res = await executeClientSideAction('ADD_CUSTOMER', parsedObj.payload, navigate);
                    responseText = parsedObj.message || res.message;
                } else if (parsedObj.action === "ADD_EXPENSE" && parsedObj.payload) {
                    const res = await executeClientSideAction('ADD_EXPENSE', parsedObj.payload, navigate);
                    responseText = parsedObj.message || res.message;
                } else if ((parsedObj.action === "PREFILL_DOCUMENT" || parsedObj.action === "CREATE_QUOTATION" || parsedObj.action === "CREATE_INVOICE") && (parsedObj.target || parsedObj.payload)) {
                    const target = parsedObj.target || (parsedObj.payload?.documentType === 'invoice' ? '/invoices/new' : '/quotations/new');
                    navigate(target, { state: { prefillData: parsedObj.payload } });
                    responseText = parsedObj.message || `Opening document form...`;
                } else if (parsedObj.action === "MARK_PAID" && parsedObj.payload) {
                    const { invoiceNumber, paymentMethod } = parsedObj.payload;
                    const { getDocs, updateDoc, doc, Timestamp } = await import('firebase/firestore');
                    try {
                        const invSnap = await getDocs(collection(db, 'invoices'));
                        const invoice = invSnap.docs.map(d=>({id: d.id, ...(d.data() as any)})).find((i: any) => i.number?.toString().includes(invoiceNumber) || i.invoice_number?.toString().includes(invoiceNumber));
                        
                        if (invoice) {
                            await updateDoc(doc(db, 'invoices', invoice.id), {
                                payment_status: 'paid',
                                balance_amount: 0,
                                amount_paid: invoice.total || invoice.grand_total
                            });
                            await addDoc(collection(db, 'payments'), {
                                document_id: invoice.id,
                                document_type: 'invoice',
                                amount: invoice.balance_amount || invoice.total || invoice.grand_total,
                                payment_method: paymentMethod || 'Cash',
                                date: Timestamp.fromDate(new Date()),
                                status: 'completed'
                            });
                            responseText = `Invoice ${invoice.number} has been marked as paid by ${paymentMethod || 'Cash'}.`;
                        } else {
                            responseText = `I couldn't find an invoice with number ${invoiceNumber}.`;
                        }
                    } catch (err) {
                        console.error("Error marking paid:", err);
                    }
                } else if (parsedObj.action === "UPDATE_STOCK" && parsedObj.payload) {
                    const { productSearch, quantityToAdd } = parsedObj.payload;
                    const { getDocs, updateDoc, doc } = await import('firebase/firestore');
                    try {
                        const prodSnap = await getDocs(collection(db, 'products'));
                        const product = prodSnap.docs.map(d=>({id: d.id, ...(d.data() as any)})).find((p: any) => p.name?.toLowerCase().includes(productSearch?.toLowerCase()));
                        
                        if (product) {
                            const newQuantity = (product.stockQuantity || 0) + (parseInt(quantityToAdd) || 0);
                            await updateDoc(doc(db, 'products', product.id), {
                                stockQuantity: newQuantity
                            });
                            responseText = `Updated stock for ${product.name}. New total is ${newQuantity}.`;
                        } else {
                            responseText = `I couldn't find a product matching ${productSearch}.`;
                        }
                    } catch (err) {
                        console.error("Error updating stock:", err);
                    }
                } else if (parsedObj.action === "DISPATCH" && parsedObj.payload) {
                    const { customerSearch, documentType } = parsedObj.payload;
                    const { getDocs } = await import('firebase/firestore');
                    try {
                        const customersSnap = await getDocs(collection(db, 'customers'));
                        const customer = customersSnap.docs.map(d=>({id: d.id, ...(d.data() as any)})).find((c: any) => c.name.toLowerCase().includes((customerSearch || '').toLowerCase()));
                        
                        if (customer) {
                            const collectionName = (documentType === 'invoice' || documentType === 'invoices') ? 'invoices' : 'quotations';
                            const docsSnap = await getDocs(collection(db, collectionName));
                            const docsList = docsSnap.docs.map(d=>({id: d.id, ...(d.data() as any)})).filter((d:any) => d.customer_id === customer.id);
                            
                            if (docsList.length > 0) {
                                const latestDoc = docsList.sort((a:any, b:any) => b.created_at.toMillis() - a.created_at.toMillis())[0];
                                const { downloadPDF } = await import('../utils/pdfGenerator');
                                const settingsSnap = await getDocs(collection(db, 'settings'));
                                const settings = settingsSnap.docs[0]?.data() as any;
                                downloadPDF(latestDoc, customer.name, documentType === 'invoice' ? 'Invoice' : 'Quotation', 'share', settings);
                                responseText = `I have opened the latest ${documentType} for ${customer.name} in WhatsApp!`;
                            } else {
                                responseText = `I couldn't find any ${documentType}s for ${customer.name}.`;
                            }
                        } else {
                            responseText = `I couldn't find a customer matching ${customerSearch}.`;
                        }
                    } catch (err) {
                        console.error("Error dispatching document:", err);
                    }
                }
            }

            setAiResponse(responseText);
            appendMessage({ type: 'ai', text: responseText });
            conditionalSpeak(responseText);

        } catch (error) {
            console.error("Audit dispatch failed:", error);
            setStatus('error');
            const errFallback = "I encountered an issue processing that. Please try again.";
            setAiResponse(errFallback);
            appendMessage({ type: 'ai', text: errFallback });
            conditionalSpeak(errFallback);
        } finally {
            if (status !== 'speaking') {
                setStatus('idle');
            }
        }
    };

    const sendText = (text: string) => {
        setTranscript(text);
        appendMessage({ type: 'user', text });
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
            messages,
            pendingAction, confirmAction, cancelAction,
            startSession, stopSession, sendText,
            capabilities, activeAuditThread, dispatchAudit,
            sessions, activeSessionId, activeSession,
            startNewChat, selectSession, deleteSession, clearAllHistory,
            isHistoryOpen, setIsHistoryOpen, toggleHistory
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
