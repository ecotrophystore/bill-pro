import { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  X, 
  Send, 
  Mic, 
  MicOff, 
  ChevronRight,
  User as UserIcon,
  Sparkles
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

// Custom markdown parser for clean, structured rendering of bullet points, bolding, headers, and code snippets
function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: { type: 'ul' | 'ol'; items: React.ReactNode[] } | null = null;
  
  const parseInline = (str: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let temp = str;
    let key = 0;
    
    while (temp.length > 0) {
      const boldIdx = temp.indexOf('**');
      const codeIdx = temp.indexOf('`');
      
      if (boldIdx === -1 && codeIdx === -1) {
        parts.push(temp);
        break;
      }
      
      if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
        if (boldIdx > 0) {
          parts.push(temp.substring(0, boldIdx));
        }
        temp = temp.substring(boldIdx + 2);
        const closingBoldIdx = temp.indexOf('**');
        if (closingBoldIdx !== -1) {
          parts.push(<strong key={key++} className="font-extrabold text-primary-dark">{temp.substring(0, closingBoldIdx)}</strong>);
          temp = temp.substring(closingBoldIdx + 2);
        } else {
          parts.push('**' + temp);
          break;
        }
      } else {
        if (codeIdx > 0) {
          parts.push(temp.substring(0, codeIdx));
        }
        temp = temp.substring(codeIdx + 1);
        const closingCodeIdx = temp.indexOf('`');
        if (closingCodeIdx !== -1) {
          parts.push(<code key={key++} className="bg-primary-light/40 text-primary-dark px-1.5 py-0.5 rounded font-mono text-xs border border-primary/20">{temp.substring(0, closingCodeIdx)}</code>);
          temp = temp.substring(closingCodeIdx + 1);
        } else {
          parts.push('`' + temp);
          break;
        }
      }
    }
    return parts;
  };

  const flushList = (key: number) => {
    if (currentList) {
      if (currentList.type === 'ul') {
        elements.push(<ul key={`ul-${key}`} className="list-disc pl-5 my-2 space-y-1.5 text-secondary">{currentList.items}</ul>);
      } else {
        elements.push(<ol key={`ol-${key}`} className="list-decimal pl-5 my-2 space-y-1.5 text-secondary">{currentList.items}</ol>);
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed === '') {
      flushList(i);
      continue;
    }

    const isBullet = trimmed.startsWith('* ') || trimmed.startsWith('- ');
    const isNumbered = /^\d+\.\s/.test(trimmed);

    if (isBullet) {
      const content = trimmed.substring(2);
      if (!currentList || currentList.type !== 'ul') {
        flushList(i);
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(<li key={`li-${i}`}>{parseInline(content)}</li>);
    } else if (isNumbered) {
      const match = trimmed.match(/^(\d+)\.\s(.*)/);
      const content = match ? match[2] : trimmed;
      if (!currentList || currentList.type !== 'ol') {
        flushList(i);
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(<li key={`li-${i}`}>{parseInline(content)}</li>);
    } else {
      flushList(i);
      if (trimmed.startsWith('### ')) {
        elements.push(<h4 key={`h3-${i}`} className="text-sm font-bold text-primary-dark mt-3 mb-1">{parseInline(trimmed.substring(4))}</h4>);
      } else if (trimmed.startsWith('## ')) {
        elements.push(<h3 key={`h2-${i}`} className="text-base font-bold text-primary-dark mt-4 mb-2">{parseInline(trimmed.substring(3))}</h3>);
      } else if (trimmed.startsWith('# ')) {
        elements.push(<h2 key={`h1-${i}`} className="text-lg font-extrabold text-primary-dark mt-4 mb-2">{parseInline(trimmed.substring(2))}</h2>);
      } else if (trimmed === '--' || trimmed === '---') {
        elements.push(<hr key={`hr-${i}`} className="my-3 border-shadow-darker/20" />);
      } else {
        elements.push(<p key={`p-${i}`} className="my-1.5 leading-relaxed">{parseInline(line)}</p>);
      }
    }
  }
  
  flushList(lines.length);
  return elements;
}

export function AIAuditor() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
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
    if (!isOpen) return;

    if (!user) {
      // Default Greeting for unsigned users
      setMessages([{
        role: 'model',
        parts: [{ text: "Hello! I'm your EcoBill Auditor. (Note: You are not signed in, so this chat won't be saved). How can I help you today?" }]
      }]);
      return;
    }

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
      
      if (history.length > 0) {
        setMessages(history);
      } else {
        // Default Greeting
        setMessages([{
          role: 'model',
          parts: [{ text: "Hello! I'm your EcoBill Auditor. I can help you find invoices, check quotations, or verify GST compliance. How can I help you today?" }]
        }]);
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
    if (!text) return;

    setInput('');
    setTranscript('');
    
    // 1. Add User Message to local state & Firestore
    const userMsg: Message = {
      role: 'user',
      parts: [{ text }],
      timestamp: serverTimestamp()
    };
    
    // Optimistically update local state
    if (!user) {
      setMessages(prev => [...prev, userMsg]);
    }
    
    if (user) {
      await addDoc(collection(db, 'users', user.uid, 'chat_history'), userMsg);
    }
    
    setIsTyping(true);

    try {
      if (!user) {
        // Mock response for unsigned users to bypass backend auth error
        setTimeout(() => {
          const modelMsg: Message = {
            role: 'model',
            parts: [{ text: "This is a local preview of the AI Auditor! I am simulating this response because you are not signed in. Please sign in to connect to the live Gemini backend." }],
            timestamp: serverTimestamp()
          };
          setMessages(prev => [...prev, modelMsg]);
          setIsTyping(false);
        }, 1500);
        return;
      }

      // 2. Call aiAuditor Function
      const aiAuditorFn = httpsCallable<{ message: string, history: any[] }, { text: string, history: any[] }>(functions, 'aiAuditor');
      
      // Map history for Gemini SDK
      const historyForAI = messages.slice(-10).map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const result = await aiAuditorFn({ message: text, history: historyForAI });
      
      // 3. Add Model Response to Firestore
      const modelMsg: Message = {
        role: 'model',
        parts: [{ text: result.data.text }],
        timestamp: serverTimestamp()
      };
      
      await addDoc(collection(db, 'users', user.uid, 'chat_history'), modelMsg);
    } catch (err: any) {
      console.error('AI Error:', err);
      
      let errorText = "I'm sorry, I cannot connect to my backend right now. (Error: " + err.message + ")";
      
      // Provide a friendly mock response if the user's API key is out of credits
      if (err.message && err.message.includes("prepayment credits are depleted")) {
         errorText = "[Mock Mode]: Hello! It looks like your Gemini API key has run out of credits. As a fallback, I'm simulating this response so you can still test the chat interface. Please update your billing in Google AI Studio to restore live AI capabilities.";
      }

      const errorMsg: Message = {
        role: 'model',
        parts: [{ text: errorText }]
      };
      setMessages(prev => [...prev, errorMsg]);
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
                {renderMarkdown(msg.parts[0].text)}
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
