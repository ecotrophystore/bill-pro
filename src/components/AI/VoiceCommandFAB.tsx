import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Loader2, X, ChevronUp, Globe, Sparkles, Zap, History } from 'lucide-react';
import { useVoiceCommand } from '../../contexts/VoiceCommandContext';
import clsx from 'clsx';

const LANGUAGE_OPTIONS = [
  { code: 'auto', label: 'Auto', flag: '🌍' },
  { code: 'en-IN', label: 'English', flag: '🇬🇧' },
  { code: 'ta-IN', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'hi-IN', label: 'हिंदी', flag: '🇮🇳' },
];

const SUGGESTIONS = [
  { text: 'Go to dashboard', icon: '🏠' },
  { text: 'What is my revenue?', icon: '💰' },
  { text: 'Create new invoice', icon: '📄' },
  { text: 'Show unpaid invoices', icon: '⏳' },
  { text: 'Create cash memo', icon: '💵' },
  { text: 'How many products?', icon: '📦' },
  { text: 'Open reports', icon: '📊' },
  { text: 'What is my profit?', icon: '📈' },
];

export function VoiceCommandFAB() {
  const {
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
    cancelSpeech,
    clearHistory,
  } = useVoiceCommand();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [textInput, setTextInput] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isExpanded]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (isExpanded && voiceState === 'idle') {
          // Don't close if actively listening
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, voiceState]);

  const handleMicClick = () => {
    if (voiceState === 'listening') {
      stopListening();
    } else if (voiceState === 'speaking') {
      cancelSpeech();
    } else {
      if (!isExpanded) setIsExpanded(true);
      startListening();
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (textInput.trim()) {
      processCommand(textInput.trim());
      setTextInput('');
    }
  };

  const handleSuggestionClick = (text: string) => {
    processCommand(text);
  };

  const getStateLabel = () => {
    switch (voiceState) {
      case 'listening': return 'Listening...';
      case 'processing': return 'Processing...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error occurred';
      default: return 'Voice Commander';
    }
  };

  const getStateColor = () => {
    switch (voiceState) {
      case 'listening': return 'from-red-500 to-red-600';
      case 'processing': return 'from-amber-500 to-orange-500';
      case 'speaking': return 'from-blue-500 to-indigo-500';
      case 'error': return 'from-gray-500 to-gray-600';
      default: return 'from-emerald-600 to-teal-700';
    }
  };

  if (!isSupported) return null;

  return (
    <div ref={panelRef} className="fixed bottom-6 left-6 z-[70] flex flex-col items-start gap-3">
      {/* Expanded Panel */}
      {isExpanded && (
        <div className="w-[380px] max-h-[520px] bg-surface rounded-2xl shadow-neo-raised border border-shadow-darker/20 overflow-hidden animate-fade-in flex flex-col">
          {/* Panel Header */}
          <div className={`bg-gradient-to-r ${getStateColor()} p-4 text-white`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="animate-pulse" />
                <span className="font-bold text-sm tracking-wide">EcoBill Voice AI</span>
              </div>
              <div className="flex items-center gap-1">
                {/* Language Picker */}
                <div className="relative">
                  <button
                    onClick={() => setShowLangPicker(!showLangPicker)}
                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-xs flex items-center gap-1"
                  >
                    <Globe size={14} />
                    <span>{LANGUAGE_OPTIONS.find(l => l.code === selectedLanguage)?.flag}</span>
                  </button>
                  {showLangPicker && (
                    <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[140px] z-10">
                      {LANGUAGE_OPTIONS.map(lang => (
                        <button
                          key={lang.code}
                          onClick={() => { setSelectedLanguage(lang.code); setShowLangPicker(false); }}
                          className={clsx(
                            "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors",
                            selectedLanguage === lang.code && "bg-primary/10 text-primary font-semibold"
                          )}
                        >
                          <span>{lang.flag}</span>
                          <span className="text-gray-700">{lang.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Status Bar */}
            <div className="flex items-center gap-2">
              <div className={clsx(
                "w-2 h-2 rounded-full",
                voiceState === 'listening' && "bg-red-300 animate-pulse",
                voiceState === 'processing' && "bg-yellow-300 animate-spin",
                voiceState === 'speaking' && "bg-blue-300 animate-bounce",
                voiceState === 'idle' && "bg-green-300",
                voiceState === 'error' && "bg-gray-300",
              )} />
              <span className="text-xs font-medium text-white/90">{getStateLabel()}</span>
            </div>
          </div>

          {/* Visualizer / Transcript Area */}
          <div className="px-4 py-3 border-b border-shadow-darker/10 min-h-[80px] flex flex-col justify-center bg-surface/80">
            {voiceState === 'listening' && (
              <div className="space-y-2">
                {/* Audio Visualizer */}
                <div className="flex items-end justify-center gap-[3px] h-8">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-[3px] bg-gradient-to-t from-primary to-emerald-400 rounded-full transition-all duration-100"
                      style={{
                        height: `${Math.random() * 100}%`,
                        animationDelay: `${i * 50}ms`,
                        opacity: 0.6 + Math.random() * 0.4,
                      }}
                    />
                  ))}
                </div>
                {interimTranscript && (
                  <p className="text-sm text-secondary italic text-center animate-pulse">
                    {interimTranscript}
                  </p>
                )}
              </div>
            )}

            {voiceState === 'processing' && (
              <div className="flex items-center justify-center gap-2">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-sm text-secondary font-medium">Understanding your command...</span>
              </div>
            )}

            {voiceState === 'speaking' && (
              <div className="flex items-center justify-center gap-2">
                <Volume2 size={20} className="text-blue-500 animate-pulse" />
                <span className="text-sm text-primary-dark font-medium">{response}</span>
              </div>
            )}

            {voiceState === 'idle' && response && (
              <div className="space-y-1">
                {transcript && (
                  <p className="text-xs text-secondary">
                    <span className="font-bold">You said:</span> "{transcript}"
                  </p>
                )}
                <p className="text-sm text-primary-dark font-medium flex items-start gap-1.5">
                  <Zap size={14} className="text-primary shrink-0 mt-0.5" />
                  {response}
                </p>
              </div>
            )}

            {voiceState === 'idle' && !response && (
              <p className="text-sm text-secondary text-center">
                Tap the mic or type a command below
              </p>
            )}
          </div>

          {/* Quick Suggestions */}
          {voiceState === 'idle' && !showHistory && (
            <div className="px-4 py-3 border-b border-shadow-darker/10 max-h-[180px] overflow-y-auto">
              <p className="text-[10px] font-bold text-secondary uppercase tracking-wider mb-2">Quick Commands</p>
              <div className="grid grid-cols-2 gap-1.5">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s.text)}
                    className="text-left px-3 py-2 rounded-xl bg-white/60 hover:bg-primary/10 border border-shadow-darker/10 hover:border-primary/30 transition-all text-xs font-medium text-primary-dark flex items-center gap-1.5 group"
                  >
                    <span className="text-base">{s.icon}</span>
                    <span className="truncate group-hover:text-primary transition-colors">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Command History */}
          {showHistory && (
            <div className="px-4 py-3 border-b border-shadow-darker/10 max-h-[200px] overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-secondary uppercase tracking-wider">History</p>
                {commandHistory.length > 0 && (
                  <button onClick={clearHistory} className="text-[10px] text-error hover:underline">Clear</button>
                )}
              </div>
              {commandHistory.length === 0 ? (
                <p className="text-xs text-secondary text-center py-4">No commands yet</p>
              ) : (
                <div className="space-y-2">
                  {[...commandHistory].reverse().slice(0, 10).map((cmd, i) => (
                    <div key={i} className="p-2 rounded-lg bg-white/40 border border-shadow-darker/5">
                      <p className="text-xs font-medium text-primary-dark truncate">🎤 {cmd.transcript}</p>
                      <p className="text-[10px] text-secondary mt-0.5 truncate">→ {cmd.response}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={clsx(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-bold",
                          cmd.intent === 'navigate' && "bg-blue-100 text-blue-700",
                          cmd.intent === 'create' && "bg-green-100 text-green-700",
                          cmd.intent === 'query' && "bg-purple-100 text-purple-700",
                          cmd.intent === 'action' && "bg-orange-100 text-orange-700",
                          cmd.intent === 'unknown' && "bg-gray-100 text-gray-600",
                        )}>
                          {cmd.intent.toUpperCase()}
                        </span>
                        <span className="text-[9px] text-secondary">
                          {cmd.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Text Input + Controls */}
          <div className="p-3 bg-surface flex flex-col gap-2">
            <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 neo-input !py-2.5 !px-3 text-sm"
              />
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className={clsx(
                  "p-2.5 rounded-xl transition-all",
                  showHistory ? "bg-primary/10 text-primary" : "text-secondary hover:text-primary hover:bg-primary/5"
                )}
              >
                <History size={16} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Main FAB Button */}
      <button
        onClick={handleMicClick}
        className={clsx(
          "relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300",
          voiceState === 'listening' && "bg-red-500 text-white scale-110",
          voiceState === 'processing' && "bg-amber-500 text-white",
          voiceState === 'speaking' && "bg-blue-500 text-white",
          voiceState === 'error' && "bg-gray-500 text-white",
          voiceState === 'idle' && "bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-neo-raised hover:scale-110",
        )}
        title="Voice Commander"
      >
        {/* Pulse Rings */}
        {voiceState === 'listening' && (
          <>
            <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
            <span className="absolute -inset-2 rounded-full border-2 border-red-400/40 animate-pulse" />
            <span className="absolute -inset-4 rounded-full border border-red-300/20 animate-pulse" style={{ animationDelay: '300ms' }} />
          </>
        )}
        
        {voiceState === 'processing' && (
          <Loader2 size={24} className="animate-spin" />
        )}
        {voiceState === 'speaking' && (
          <Volume2 size={24} className="animate-pulse" />
        )}
        {(voiceState === 'idle' || voiceState === 'error' || voiceState === 'listening') && (
          voiceState === 'listening' ? <MicOff size={24} /> : <Mic size={24} />
        )}

        {/* Expand indicator */}
        {!isExpanded && voiceState === 'idle' && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full flex items-center justify-center shadow-md">
            <ChevronUp size={10} className="text-white" />
          </span>
        )}
      </button>

      {/* Mini label */}
      {!isExpanded && voiceState === 'idle' && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-[10px] font-bold text-primary-dark bg-surface/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-neo-surface -mt-1 hover:bg-primary/10 transition-colors"
        >
          🎤 Voice AI
        </button>
      )}
    </div>
  );
}
