import { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  ChevronRight,
  User as UserIcon,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useVoice } from '../../hooks/useVoice';
import { functions, db } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import clsx from 'clsx';

interface Message {
  id?: string;
  role: 'user' | 'model';
  parts: { text: string }[];
  timestamp?: any;
}

export function AIAuditor() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { isListening, transcript, startListening, stopListening, setTranscript } = useVoice();

  // Handle Speech to Text interaction
  useEffect(() => {
    if (transcript && !isListening) {
      setInput(transcript);
    }
  }, [transcript, isListening]);

  // Persistence: Load chat history from Firestore
  useEffect(() => {
    if (!user || !isOpen || !db) return;

    setLoading(true);
    setError(null);
    console.log("AI Auditor: Loading history for", user.uid);
    const q = query(
      collection(db, 'users', user.uid, 'chat_history'),
      orderBy('timestamp', 'asc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      
      console.log("AI Auditor: History updated", history.length, "messages");
      
      if (history.length > 0) {
        setMessages(history);
      } else {
        // Default Greeting
        setMessages([{
          role: 'model',
          parts: [{ text: "Hey! Let's get to work! 🚀 Before we start, would you prefer to chat in English or Tamil (தமிழ்)?" }]
        }]);
      }
      setLoading(false);
    }, (err) => {
      console.error("AI Auditor Snapshot Error:", err);
      setLoading(false);
      if (err.code === 'permission-denied') {
        setError("Missing permissions for chat history. Check firestore.rules.");
      }
    });

    return () => unsubscribe();
  }, [user, isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text || !user) return;

    setInput('');
    setTranscript('');
    
    setIsTyping(true);
    
    try {
      if (!db || !functions) throw new Error("Firebase not initialized");

      // 1. Add User Message to Firestore
      const userMsg: Message = {
        role: 'user',
        parts: [{ text }],
        timestamp: serverTimestamp()
      };
      await addDoc(collection(db, 'users', user.uid, 'chat_history'), userMsg);
      
      // 2. Call aiAuditor Function
      const aiAuditorFn = httpsCallable<{ message: string, history: any[] }, { text: string, history: any[] }>(functions, 'aiAuditor');
      
      const historyForAI = messages
        .slice(-10)
        .map(m => ({
          role: m.role,
          parts: m.parts
        }));

      // Ensure history starts with 'user' role
      const firstUserIdx = historyForAI.findIndex(m => m.role === 'user');
      const filteredHistory = firstUserIdx !== -1 ? historyForAI.slice(firstUserIdx) : [];

      const result = await aiAuditorFn({ message: text, history: filteredHistory });
      
      // 3. Add Model Response to Firestore
      const modelMsg: Message = {
        role: 'model',
        parts: [{ text: result.data.text }],
        timestamp: serverTimestamp()
      };
      
      await addDoc(collection(db, 'users', user.uid, 'chat_history'), modelMsg);
    } catch (err: any) {
      console.error('AI Auditor Error:', err);
      setError(err.message || 'Failed to get response from AI Auditor');
      setIsTyping(false);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {/* Floating Action Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-neo-raised",
          isOpen ? "bg-error text-surface rotate-90" : "bg-primary text-surface hover:scale-110"
        )}
      >
        {isOpen ? <X size={24} /> : <Bot size={28} className="animate-pulse" />}
      </button>

      {/* Chat Drawer Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[-1] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Chat Drawer */}
      <div 
        className={clsx(
          "fixed top-0 right-0 h-full w-full max-w-md bg-surface shadow-[-10px_0_30px_rgba(0,0,0,0.1)] transition-transform duration-500 transform border-l border-shadow-darker/20 flex flex-col z-50",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="p-6 border-b border-shadow-darker/20 flex items-center justify-between bg-surface/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shadow-neo-inset">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="font-bold text-primary-dark leading-tight">AI Auditor</h3>
              <p className="text-xs text-secondary">Ecotrophy Innovations Assistant</p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-2 neo-btn !px-3 !py-2 !rounded-full">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-6"
        >
          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">System Error</p>
                <p>{error}</p>
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-2 underline font-semibold"
                >
                  Reload Page
                </button>
              </div>
            </div>
          )}

          {loading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 space-y-3 opacity-50">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-xs font-medium text-secondary">Securing connection...</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div 
              key={msg.id || i} 
              className={clsx(
                "flex gap-3 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-neo-raised",
                msg.role === 'user' ? "bg-primary text-surface" : "bg-white text-secondary"
              )}>
                {msg.role === 'user' ? <UserIcon size={14} /> : <Bot size={14} />}
              </div>
              
              <div className={clsx(
                "neo-card !p-3 !rounded-2xl text-sm leading-relaxed",
                msg.role === 'user' ? "!bg-primary !text-surface !shadow-neo-pressed" : "!bg-white/80"
              )}>
                {msg.parts[0].text}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-3 mr-auto items-center">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-neo-raised">
                <Bot size={14} className="text-secondary animate-bounce" />
              </div>
              <div className="flex gap-1.5 p-3 rounded-2xl bg-white/50 shadow-neo-inset">
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-surface border-t border-shadow-darker/20">
          <form 
            onSubmit={sendMessage}
            className="flex items-center gap-3"
          >
            <div className="flex-1 relative">
              <input 
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything..."
                className="w-full neo-input !py-3 !pr-12 text-sm"
              />
              <button 
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={clsx(
                  "absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors",
                  isListening ? "text-error animate-pulse" : "text-secondary hover:text-primary"
                )}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
            
            <button 
              type="submit"
              disabled={!input.trim() || isTyping}
              className="w-11 h-11 rounded-full bg-primary text-surface flex items-center justify-center shadow-neo-raised disabled:opacity-50 disabled:shadow-none hover:scale-105 active:scale-95 transition-all"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
