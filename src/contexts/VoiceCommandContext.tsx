import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Shared/Toast';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useVoiceForm } from './VoiceFormContext';

// ─── Voice Architecture Note ────────────────────────────────────────────────
// EcoBill Pattu uses a hybrid browser voice assistant pattern (non-WebRTC).
// 1. STT: Web Speech API (transcription may be server-backed by browser vendor).
// 2. Orchestration: Firebase Cloud Functions + Gemini Flash (text-first pipeline).
// 3. TTS: Web Speech Synthesis (voice availability is OS/browser dependent).
// 4. Turn-taking: 2.0s silence detection loop for a "live" feel.
// ─────────────────────────────────────────────────────────────────────────────

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
type IntentType = 'navigate' | 'create' | 'query' | 'delete' | 'action' | 'unknown';

interface VoiceCommand {
  transcript: string;
  intent: IntentType;
  confidence: number;
  response: string;
  timestamp: Date;
}

interface VoiceContextType {
  voiceState: VoiceState;
  transcript: string;
  interimTranscript: string;
  response: string;
  commandHistory: VoiceCommand[];
  isSupported: boolean;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  startListening: () => void;
  stopListening: () => void;
  processCommand: (text: string) => Promise<void>;
  speak: (text: string) => void;
  cancelSpeech: () => void;
  clearHistory: () => void;
}

const VoiceCommandContext = createContext<VoiceContextType | null>(null);
export const useVoiceCommand = () => {
  const ctx = useContext(VoiceCommandContext);
  if (!ctx) throw new Error('useVoiceCommand must be used within VoiceCommandProvider');
  return ctx;
};

// ─── Language Configs ────────────────────────────────────────────────────────
const LANGUAGES: Record<string, { name: string; speechLang: string }> = {
  'en-IN': { name: 'English', speechLang: 'en-IN' },
  'ta-IN': { name: 'Tamil', speechLang: 'ta-IN' },
  'hi-IN': { name: 'Hindi', speechLang: 'hi-IN' },
  'auto': { name: 'Auto Detect', speechLang: 'en-IN' },
};

// ─── Route Map for Gemini navigation responses ──────────────────────────────
const PAGE_TO_ROUTE: Record<string, string> = {
  'dashboard': '/dashboard',
  'invoices': '/invoices',
  'quotations': '/quotations',
  'cash-memos': '/cash-memos',
  'products': '/library/products',
  'customers': '/library/customers',
  'purchases': '/purchases',
  'reconciliation': '/reconciliation',
  'reports': '/reports',
  'auditor': '/auditor',
  'settings': '/settings',
  'create-invoice': '/invoices/new',
  'create-quotation': '/quotations/new',
  'create-cashmemo': '/cash-memos/new',
};

// ─── Provider ────────────────────────────────────────────────────────────────
export function VoiceCommandProvider({ children }: { children: ReactNode }) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const voiceStateRef = useRef<VoiceState>('idle');
  useEffect(() => { voiceStateRef.current = voiceState; }, [voiceState]);

  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [commandHistory, setCommandHistory] = useState<VoiceCommand[]>([]);
  const [selectedLanguage, setSelectedLanguageState] = useState(() => {
    return localStorage.getItem('voiceLanguage') || 'auto';
  });

  const setSelectedLanguage = useCallback((lang: string) => {
    localStorage.setItem('voiceLanguage', lang);
    setSelectedLanguageState(lang);
  }, []);

  const recognitionRef = useRef<any>(null);
  const processingRef = useRef(false);
  const autoListenRef = useRef(false);
  const isStartingRef = useRef(false);
  
  const navigate = useNavigate();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);

  const { setLastAction, setOverlayType, setConfirmationRequested } = useVoiceForm();
  const voiceFormRefs = useRef({ setLastAction, setOverlayType, setConfirmationRequested });
  useEffect(() => { 
    voiceFormRefs.current = { setLastAction, setOverlayType, setConfirmationRequested };
  }, [setLastAction, setOverlayType, setConfirmationRequested]);

  const isSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // ─── Speech Recognition ──────────────────────────────────────────────────
  const startListening = useCallback((isAutoRetry = false) => {
    if (!isSupported) return;
    if (isStartingRef.current) return;
    
    if (!isAutoRetry) autoListenRef.current = true;
    
    // Don't start if already listening or speaking
    if (voiceStateRef.current === 'listening' || voiceStateRef.current === 'speaking' || processingRef.current) {
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (recognitionRef.current) {
      try { 
        recognitionRef.current.onend = null;
        recognitionRef.current.abort(); 
      } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true; // CHANGED: Always continuous to let user talk freely
    recognition.interimResults = true;
    recognition.lang = localStorage.getItem('voiceLanguage') || 'en-IN';
    if (recognition.lang === 'auto') recognition.lang = 'en-IN';

    const silenceTimerRef = { current: null as any };
    const fullTranscriptRef = { current: '' };

    recognition.onstart = () => {
      setVoiceState('listening');
      setTranscript('');
      setInterimTranscript('');
      fullTranscriptRef.current = '';
      isStartingRef.current = false;
    };

    recognition.onresult = (event: any) => {
      // Clear existing silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      let interim = '';
      let finalForThisResult = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalForThisResult += t;
        } else {
          interim += t;
        }
      }

      if (finalForThisResult) {
        fullTranscriptRef.current += finalForThisResult + ' ';
        setTranscript(fullTranscriptRef.current);
      }
      setInterimTranscript(interim);

      // Start silence detection timer (2.0s)
      silenceTimerRef.current = setTimeout(() => {
        if (voiceStateRef.current === 'listening') {
          console.log("Silence detected, stopping recognition...");
          recognition.stop(); 
        }
      }, 2000);
    };

    recognition.onerror = (event: any) => {
      isStartingRef.current = false;
      if (event.error === 'aborted') return;
      
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        autoListenRef.current = false;
        showToastRef.current('Microphone access denied.', 'error');
      }
      setVoiceState('idle');
    };

    recognition.onend = () => {
       if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
       isStartingRef.current = false;
       setVoiceState(prev => (prev === 'listening' ? 'idle' : prev));

       // If we have a transcript and recognition stopped (via silence or manual stop)
       const finalResult = fullTranscriptRef.current.trim();
       if (finalResult && !processingRef.current) {
          processCommand(finalResult);
          fullTranscriptRef.current = '';
       } else if (autoListenRef.current && !processingRef.current && voiceStateRef.current === 'idle') {
          // No text, but auto-listening is on - restart
          setTimeout(() => startListening(true), 400);
       }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      isStartingRef.current = false;
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    autoListenRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setVoiceState('idle');
  }, []);

  // Removed automatic transcript watcher because onend handles it now for better stability

  // ─── Text-to-Speech ──────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window) || !text) return;
    
    window.speechSynthesis.cancel();
    
    // STRIP MARKDOWN for clean speech
    const cleanText = text.replace(/[*_#`~]/g, '').replace(/\[|\]/g, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.93;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    
    let voices = window.speechSynthesis.getVoices();
    
    const trySpeak = () => {
       voices = window.speechSynthesis.getVoices();
       const langCode = selectedLanguage === 'auto' ? 'en-IN' : selectedLanguage;
       
       // Try to find the exact language match first, then language prefix
       let preferredVoice = voices.find(v => v.lang === langCode);
       if (!preferredVoice) {
          preferredVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
       }
       // If Google voices are available, prefer them (they sound much better)
       const googleVoice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]) && v.name.includes('Google'));
       if (googleVoice) preferredVoice = googleVoice;
       
       if (preferredVoice) utterance.voice = preferredVoice;

       utterance.onstart = () => {
         setVoiceState('speaking');
       };
       
       // Fallback if synthesis hangs
       const fallbackTimeout = setTimeout(() => {
         if (autoListenRef.current && processingRef.current === false) {
            setVoiceState('idle');
            startListening(true);
         }
       }, Math.max(3000, text.length * 100)); // Estimated time + 3s

       utterance.onend = () => {
         clearTimeout(fallbackTimeout);
         setVoiceState('idle');
         if (autoListenRef.current) {
           setTimeout(() => {
              if (autoListenRef.current) startListening(true);
           }, 500);
         }
       };
       utterance.onerror = () => {
         clearTimeout(fallbackTimeout);
         setVoiceState('idle');
         if (autoListenRef.current) {
            setTimeout(() => startListening(true), 500);
         }
       };

       window.speechSynthesis.speak(utterance);
    };

    if (voices.length === 0) {
       window.speechSynthesis.onvoiceschanged = () => {
          if (voices.length === 0) trySpeak();
       };
       // Failsafe if event doesn't fire
       setTimeout(trySpeak, 1000);
    } else {
       trySpeak();
    }
  }, [selectedLanguage, startListening]);

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setVoiceState('idle');
  }, []);

  // ─── Command Processor — Gemini AI via Cloud Function ─────────────────────
  const processCommand = useCallback(async (text: string) => {
    if (!text.trim() || processingRef.current) return;
    
    // Stop auto-listen check from user text
    const lowerText = text.toLowerCase();
    if (lowerText.includes('stop') || lowerText.includes('nirutthu') || lowerText.includes('bye') || lowerText.includes('silent mode')) {
       autoListenRef.current = false;
       speak("Okay Anna, listening niruthuren! Bye!");
       addToHistory(text, 'action', 1.0, "Stopped listening.");
       setResponse("Stopped listening.");
       setVoiceState('idle');
       return;
    }

    processingRef.current = true;
    setVoiceState('processing');
    
    let intent: IntentType = 'unknown';
    let responseText = '';

    try {
      if (!functions) {
        // Fallback: local processing if Cloud Functions unavailable
        responseText = fallbackProcess(text);
        intent = 'unknown';
        showToast(`🤖 ${responseText}`, 'info');
        speak(responseText);
        addToHistory(text, intent, 0.5, responseText);
        setResponse(responseText);
        return;
      }

      // ── Call Gemini via Cloud Function ──────────────────────────────────
      const voiceCommanderFn = httpsCallable<
        { message: string; language: string; history: any[] },
        { text: string; action: { type: string; page: string } | null; frontendActions: any[] | null }
      >(functions, 'voiceCommander');

      const formattedHistory = commandHistory.map(cmd => [
        { role: 'user', parts: [{ text: cmd.transcript }] },
        { role: 'model', parts: [{ text: cmd.response }] }
      ]).flat();

      // Add hint about current location and form fields to help Pattu context
      const lastCmd = commandHistory[commandHistory.length - 1];
      const context = {
        active_form: window.location.pathname.includes('new') ? window.location.pathname : 'none',
        last_customer: lastCmd?.transcript.includes('Raju') ? 'Raju' : 'none', // Simple heuristic for now
        current_page: window.location.pathname
      };

      const finalMessage = `[Context: ${JSON.stringify(context)}]\n${text}`;

      const result = await voiceCommanderFn({ 
        message: finalMessage, 
        language: selectedLanguage === 'auto' ? 'en' : selectedLanguage.split('-')[0],
        history: formattedHistory
      });

      responseText = result.data.text;
      const action = result.data.action;
      const frontendActions = result.data.frontendActions;

      // Handle Form Magic Actions
      if (frontendActions) {
        for (const fAction of frontendActions) {
          if (fAction.type === 'update_form_field') {
            voiceFormRefs.current.setLastAction({ fieldName: fAction.fieldName, value: fAction.value });
          } else if (fAction.type === 'open_overlay') {
            voiceFormRefs.current.setOverlayType(fAction.overlayType);
          } else if (fAction.type === 'request_confirmation') {
            voiceFormRefs.current.setConfirmationRequested(true);
          }
        }
      }

      // Execute navigation action if Gemini returned one
      if (action && action.type === 'navigate' && action.page) {
        const route = PAGE_TO_ROUTE[action.page];
        if (route) {
          intent = action.page.startsWith('create') ? 'create' : 'navigate';
          navigate(route);
          showToast(`🧭 ${responseText}`, 'success');
        } else {
          intent = 'navigate';
          showToast(`🤖 ${responseText}`, 'info');
        }
      } else if (responseText) {
        // Query or informational response
        intent = 'query';
        showToast(`📊 ${responseText}`, 'info');
      }

      speak(responseText);
      addToHistory(text, intent, 0.95, responseText);
      setResponse(responseText);

    } catch (err: any) {
      console.error('Voice Commander error:', err);
      
      // Fallback to local processing on error
      responseText = fallbackProcess(text);
      intent = 'action';
      showToast(`🤖 ${responseText}`, 'info');
      speak(responseText);
      addToHistory(text, intent, 0.6, responseText);
      setResponse(responseText);
    } finally {
      processingRef.current = false;
      // Do not set to idle here if speaking or auto listening will be handled by speak onend
      if (!responseText) {
         setVoiceState('idle');
         if (autoListenRef.current) {
            setTimeout(() => startListening(true), 500);
         }
      }
    }
  }, [navigate, showToast, speak, selectedLanguage, startListening]);

  // ─── Local Fallback (when Cloud Function is unavailable) ─────────────────
  function fallbackProcess(text: string): string {
    const t = text.toLowerCase();
    
    // Navigation fallback
    const navKeywords: Record<string, string> = {
      'dashboard': '/dashboard', 'invoice': '/invoices', 'quotation': '/quotations',
      'cash memo': '/cash-memos', 'product': '/library/products', 'customer': '/library/customers',
      'purchase': '/purchases', 'report': '/reports', 'auditor': '/auditor', 'setting': '/settings',
    };
    
    for (const [keyword, path] of Object.entries(navKeywords)) {
      if (t.includes(keyword)) {
        if (t.includes('create') || t.includes('new')) {
          if (keyword === 'invoice') { navigate('/invoices/new'); return 'Opening new invoice form.'; }
          if (keyword === 'quotation') { navigate('/quotations/new'); return 'Opening new quotation form.'; }
          if (keyword === 'cash memo') { navigate('/cash-memos/new'); return 'Opening new cash memo form.'; }
        }
        navigate(path);
        return `Navigating to ${keyword}.`;
      }
    }

    // Greetings
    if (t.match(/hello|hi|hey|vanakkam|namaste/)) return "Hello! I'm EcoBill Jarvis. How can I help you?";
    if (t.match(/help|what can you do/)) return "I can navigate pages, query financial data, and create documents. Try: Go to invoices, What is my revenue, or Create new invoice.";
    
    return `I heard: "${text}". Cloud AI is offline — using basic mode. Try: "Go to invoices" or "Create new invoice".`;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function addToHistory(text: string, intent: IntentType, confidence: number, resp: string) {
    setCommandHistory(prev => [...prev.slice(-19), {
      transcript: text,
      intent,
      confidence,
      response: resp,
      timestamp: new Date(),
    }]);
  }

  const clearHistory = useCallback(() => setCommandHistory([]), []);

  return (
    <VoiceCommandContext.Provider value={{
      voiceState,
      transcript,
      interimTranscript,
      response,
      commandHistory,
      isSupported,
      selectedLanguage,
      setSelectedLanguage,
      startListening,
      stopListening,
      processCommand,
      speak,
      cancelSpeech,
      clearHistory,
    }}>
      {children}
    </VoiceCommandContext.Provider>
  );
}
