import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, StopCircle, X, Globe, Sparkles, AlertTriangle, Send } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useVoice } from '../hooks/useVoice';
import clsx from 'clsx';

interface VoiceDictationProps {
  onParsedItems: (data1: any, data2?: any, data3?: any) => void;
  functionName?: string;
  label?: string;
}

export default function VoiceDictation({ onParsedItems, functionName = 'parseVoiceCommand', label = 'AI Auto-fill' }: VoiceDictationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<'en-US' | 'ta-IN'>(
    (localStorage.getItem('voice_lang') as 'en-US' | 'ta-IN') || 'en-US'
  );
  
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  
  const [speechMode, setSpeechMode] = useState<'voice-text' | 'text-only' | 'voice-only'>(
    (localStorage.getItem('ai_speech_mode') as 'voice-text' | 'text-only' | 'voice-only') || 'text-only'
  );
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Hook for browser SpeechRecognition
  const { 
    isListening: isRecListening, 
    transcript: recTranscript, 
    error: recVoiceError, 
    startListening: startRecListening, 
    stopListening: stopRecListening, 
    setTranscript: setRecTranscript 
  } = useVoice();

  const [useLocalRecorder, setUseLocalRecorder] = useState(false);

  // Sync unified speech mode preference
  useEffect(() => {
    const handleStorageChange = () => {
      const mode = (localStorage.getItem('ai_speech_mode') as 'voice-text' | 'text-only' | 'voice-only') || 'text-only';
      setSpeechMode(mode);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('ai_speech_mode', speechMode);
    if (speechMode === 'text-only') {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      stopRecListening();
    }
  }, [speechMode, stopRecListening]);

  useEffect(() => {
    localStorage.setItem('voice_lang', language);
  }, [language]);

  // Clean up timer, SpeechRecognition and speech on close/unmount
  useEffect(() => {
    if (!isOpen) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      stopRecListening();
      if (isListening) stopRecording();
    } else {
      // Automatically trigger listening if in voice mode on open
      if (speechMode === 'voice-text' || speechMode === 'voice-only') {
        setTimeout(() => {
          if (useLocalRecorder) {
            startRecording();
          } else {
            startRecListening();
          }
        }, 300);
      }
    }
  }, [isOpen, speechMode, stopRecListening, useLocalRecorder]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      window.speechSynthesis.cancel();
      stopRecListening();
    };
  }, [stopRecListening]);

  // Interruption logic: click anywhere cancels speech
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('input') || target.closest('textarea')) {
        return;
      }
      if (isSpeaking) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    };
    if (isSpeaking) {
      window.addEventListener('click', handleGlobalClick);
    }
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isSpeaking]);

  // Listen to browser SpeechRecognition results for auto-submit
  useEffect(() => {
    if (recTranscript && !isRecListening && (speechMode === 'voice-text' || speechMode === 'voice-only') && isOpen) {
      setTranscript(recTranscript);
      setRecTranscript('');
      setIsProcessing(true);
      setTimeout(() => {
        submitPayload(recTranscript);
      }, 200);
    }
  }, [recTranscript, isRecListening, speechMode, isOpen]);

  // Auto-recovery for SpeechRecognition timeouts and fallback on network issues
  useEffect(() => {
    if (recVoiceError && isOpen) {
      if (recVoiceError === 'no-speech' && (speechMode === 'voice-text' || speechMode === 'voice-only')) {
        if (!useLocalRecorder) {
          startRecListening();
        } else {
          startRecording();
        }
      } else if (recVoiceError === 'network') {
        setUseLocalRecorder(true);
        setAiError("Speech server unreachable. Switched to local audio recording fallback. Press 'Start Speaking' to talk.");
      } else {
        setAiError(`Voice recognition paused (${recVoiceError}). You can type or record manually.`);
      }
    }
  }, [recVoiceError, isOpen, speechMode, useLocalRecorder]);

  const speak = (text: string, andThenRecord = false) => {
    if (speechMode === 'text-only') return;
    window.speechSynthesis.cancel();
    
    const cleanText = text
      .replace(/[*`#\-]/g, '')
      .replace(/₹/g, ' Rupees ')
      .trim();

    if (!cleanText) return;

    setIsSpeaking(true);

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      
      utterance.onend = () => {
        setIsSpeaking(false);
        if (andThenRecord && (speechMode === 'voice-text' || speechMode === 'voice-only')) {
          startRecListening();
        }
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    }, 100);
  };

  const startRecording = async () => {
    try {
      setAiError(null);
      setAudioBase64(null);
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      stopRecListening();
      
      console.log("[VOICE] Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let options = { mimeType: 'audio/webm' };
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          options = { mimeType: 'audio/mp4' };
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          options = { mimeType: 'audio/ogg' };
        } else {
          options = { mimeType: '' };
        }
      }
      
      console.log("[VOICE] Initializing MediaRecorder with mimeType:", options.mimeType);
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'audio/webm';
        setAudioMimeType(mime);
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });
        console.log(`[VOICE] Recording complete. Blob: ${audioBlob.size} bytes. Mime: ${mime}`);
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = (reader.result as string).split(',')[1];
          setAudioBase64(base64data);
          setTranscript("[Audio voice message captured. Click Submit to analyze]");
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      setRecordingSeconds(0);
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      
    } catch (err: any) {
      console.error("[VOICE] MediaRecorder initialization failed:", err);
      setAiError("Microphone access denied. Please grant microphone permissions in your browser settings to speak.");
      speak("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    setIsListening(false);
  };

  const toggleVoiceInteraction = () => {
    if (isRecListening || isListening || isSpeaking || isProcessing) {
      window.speechSynthesis.cancel();
      stopRecListening();
      if (isListening) stopRecording();
      setIsSpeaking(false);
    } else {
      if (useLocalRecorder) {
        startRecording();
      } else {
        startRecListening();
      }
    }
  };

  const handleProcess = async () => {
    if (isListening) {
      stopRecording();
      setTimeout(() => {
        submitPayload();
      }, 600);
      return;
    }
    submitPayload();
  };

  const submitPayload = async (overrideText?: string) => {
    const textToProcess = (overrideText || ((transcript !== "[Audio voice message captured. Click Submit to analyze]") ? transcript.trim() : ""));
    
    if (!audioBase64 && !textToProcess) {
      setAiError("Please speak or type some instructions first.");
      speak("Please speak or type some instructions first.");
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    setAiError(null);
    setFollowUp(null);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    stopRecListening();

    
    try {
      const parseFn = httpsCallable(functions, functionName);
      
      const payload: any = {};
      if (audioBase64) {
        payload.audio = {
          data: audioBase64,
          mimeType: audioMimeType
        };
      }
      if (textToProcess) {
        payload.transcript = textToProcess;
      }
      
      // Inject unified voice details
      payload.speechMode = speechMode;
      payload.continuous = true;

      console.log(`[API] ${functionName} Request:`, { ...payload, audio: payload.audio ? "(base64 data)" : undefined });
      const result = await parseFn(payload);
      const data = result.data as any;
      
      console.log(`[API] ${functionName} Response:`, data);
      
      if (data && data.success) {
        speak("Success. Autofilled requested fields.");
        if (functionName === 'parsePurchaseVoice') {
          onParsedItems(data);
        } else {
          onParsedItems(data.customerName, data.items, data.customerType);
        }
        setIsOpen(false);
        setTranscript('');
        setAudioBase64(null);
      } else if (data && data.followUpQuestion) {
        setFollowUp(data.followUpQuestion);
        setAudioBase64(null);
        setTranscript('');
        // AI follow-up read aloud. When finished, automatically start recording again
        speak(data.followUpQuestion, true);
      } else {
        const errMsg = data?.error || "AI could not extract details. Please try speaking again.";
        setAiError(errMsg);
        speak(errMsg);
      }
    } catch (err: any) {
      console.error("[VoiceDictation] API Execution error:", err);
      const errMsg = err.message || "Failed to process voice command.";
      setAiError(errMsg);
      speak(errMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (isListening) stopRecording();
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    setIsOpen(false);
    setTranscript('');
    setAudioBase64(null);
    setAiError(null);
    setFollowUp(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        title={label}
        className="px-4 py-2 rounded-full transition-all flex items-center justify-center gap-2 bg-surface shadow-neo-raised text-secondary hover:text-primary-dark border border-shadow-darker/5"
      >
        <Mic size={16} className="text-primary" />
        <span className="text-sm font-bold">{label}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface border border-shadow-darker/10 rounded-3xl w-full max-w-lg shadow-neo-raised flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-shadow-darker/5 bg-primary-light/10">
              <div className="flex items-center gap-2">
                <Sparkles size={20} className="text-primary" />
                <h2 className="text-lg font-bold text-primary-dark">AI Voice Assistant</h2>
              </div>
              <button onClick={handleClose} className="p-1.5 rounded-full hover:bg-shadow-darker/10 text-secondary transition-all">
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto max-h-[70vh]">
              {/* Voice preference controls sync */}
              <div className="flex items-center justify-between bg-primary-light/5 p-3 rounded-2xl border border-primary/5 text-xs">
                <span className="font-bold text-secondary uppercase tracking-wider">Response Mode:</span>
                <div className="flex bg-surface rounded-lg p-0.5 shadow-neo-inset">
                  {(['text-only', 'voice-text', 'voice-only'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSpeechMode(mode)}
                      className={clsx(
                        "px-2.5 py-1 rounded-md font-bold transition-all text-[10px] uppercase tracking-tighter",
                        speechMode === mode 
                          ? "bg-primary text-surface shadow-neo-raised" 
                          : "text-secondary hover:text-primary"
                      )}
                    >
                      {mode === 'text-only' ? 'Text' : mode === 'voice-text' ? 'Voice+Text' : 'Voice Only'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center justify-between bg-primary-light/5 p-3.5 rounded-2xl border border-primary/5">
                <span className="text-sm font-medium text-secondary flex items-center gap-1.5">
                  <Globe size={16} className="text-primary" />
                  Voice Language
                </span>
                <div className="flex bg-surface shadow-inner p-1 rounded-xl border border-shadow-darker/5">
                  <button 
                    onClick={() => setLanguage('en-US')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                      language === 'en-US' ? 'bg-primary text-surface shadow-neo-raised' : 'text-secondary hover:text-primary-dark'
                    )}
                  >
                    English
                  </button>
                  <button 
                    onClick={() => setLanguage('ta-IN')}
                    className={clsx(
                      "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                      language === 'ta-IN' ? 'bg-primary text-surface shadow-neo-raised' : 'text-secondary hover:text-primary-dark'
                    )}
                  >
                    தமிழ் (Tamil)
                  </button>
                </div>
              </div>

              {/* Follow-up question banner */}
              {followUp && (
                <div className="bg-warning-light/30 border border-warning/20 p-4 rounded-2xl flex gap-3 text-warning-dark">
                  <Sparkles size={20} className="shrink-0 mt-0.5 text-warning animate-bounce" />
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider">AI Needs Clarification:</h4>
                    <p className="text-sm font-semibold mt-1">{followUp}</p>
                  </div>
                </div>
              )}

              {/* Glowing Dynamic Waveforms (Blue for listening, Orange for speaking) */}
              {(isListening || isRecListening) && (
                <div className="flex flex-col items-center justify-center p-6 bg-primary-light/10 border border-primary/10 rounded-2xl space-y-3">
                  <div className="flex items-end gap-1.5 h-10">
                    {[...Array(6)].map((_, i) => (
                      <span 
                        key={i} 
                        className="w-1 bg-primary rounded-full animate-wave-blue"
                        style={{ animationDelay: `${i * 120}ms` }}
                      ></span>
                    ))}
                  </div>
                  <span className="text-xs font-black text-primary tracking-wider uppercase animate-pulse">
                    Listening to you...
                  </span>
                </div>
              )}

              {isSpeaking && (
                <div className="flex flex-col items-center justify-center p-6 bg-warning-light/10 border border-warning/10 rounded-2xl space-y-3">
                  <div className="flex items-end gap-1.5 h-10">
                    {[...Array(6)].map((_, i) => (
                      <span 
                        key={i} 
                        className="w-1 bg-warning rounded-full animate-wave-orange"
                        style={{ animationDelay: `${i * 120}ms` }}
                      ></span>
                    ))}
                  </div>
                  <span className="text-xs font-black text-warning tracking-wider uppercase animate-pulse">
                    AI Speaking... Click anywhere to Interrupt
                  </span>
                </div>
              )}

              {/* Text / Status Area */}
              <div className="space-y-2">
                <label className="text-xs font-black text-secondary tracking-widest uppercase">Speech Transcript or Notes</label>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={language === 'ta-IN' ? 'தமிழ் அல்லது ஆங்கிலத்தில் பேசுங்கள் (அல்லது இங்கே தட்டச்சு செய்யவும்)...' : 'Speak or type your instructions directly...'}
                  className="w-full min-h-[120px] p-4 rounded-2xl bg-surface border border-shadow-darker/10 focus:outline-none focus:border-primary/50 text-primary-dark font-medium shadow-inner resize-y transition-all"
                />
              </div>

              {/* Error Box */}
              {aiError && (
                <div className="bg-error-light/20 border border-error/20 p-4 rounded-2xl flex gap-3 text-error-dark">
                  <AlertTriangle size={20} className="shrink-0 mt-0.5 text-error" />
                  <div>
                    <h4 className="text-sm font-bold">Analysis/Microphone Error</h4>
                    <p className="text-xs font-semibold mt-1 opacity-90">{aiError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-shadow-darker/5 bg-surface-darker/20 flex gap-3 justify-between items-center">
              <div>
                {(isListening || isRecListening) ? (
                  <button 
                    onClick={isListening ? stopRecording : stopRecListening}
                    className="neo-btn bg-red-100 text-red-600 border border-red-200 px-4 py-2 flex items-center gap-2 hover:bg-red-200/50"
                  >
                    <StopCircle size={16} />
                    <span>Stop Listening</span>
                  </button>
                ) : (
                  <button 
                    onClick={toggleVoiceInteraction}
                    disabled={isProcessing}
                    className="neo-btn bg-primary-light/20 text-primary-dark border border-primary/20 px-4 py-2 flex items-center gap-2 hover:bg-primary-light/40"
                  >
                    <Mic size={16} />
                    <span>{followUp ? 'Speak Clarification' : 'Start Speaking'}</span>
                  </button>
                )}
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={handleClose} 
                  disabled={isProcessing}
                  className="px-4 py-2 border border-shadow-darker/10 rounded-xl hover:bg-shadow-darker/5 font-bold text-secondary text-sm transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleProcess}
                  disabled={isProcessing || (!transcript.trim() && !audioBase64)}
                  className="px-5 py-2 rounded-xl bg-primary text-surface hover:scale-[1.02] shadow-neo-raised font-bold text-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Submit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

