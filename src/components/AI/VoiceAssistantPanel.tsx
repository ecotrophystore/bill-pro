import React, { useState, useRef, useEffect } from 'react';
import { useAi } from '../../contexts/AiContext';
import { AiChatHistorySidebar } from './AiChatHistorySidebar';
import { formatMessageTime, formatSessionDateLabel } from '../../services/aiChatHistoryService';

export const VoiceAssistantPanel: React.FC = () => {
    const { 
        isOpen, toggleAi, status, 
        interactionMode, setInteractionMode,
        transcript, aiResponse, messages,
        pendingAction, confirmAction, cancelAction,
        startSession, stopSession, sendText, volumeLevel,
        sessions, activeSessionId, activeSession,
        startNewChat, isHistoryOpen, setIsHistoryOpen, toggleHistory
    } = useAi();
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [textInput, setTextInput] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, status]);

    if (!isOpen) return null;

    const copyToClipboard = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <div 
            className={`fixed z-50 neo-card overflow-hidden !p-0 transition-all duration-300 flex flex-col shadow-2xl border border-[#D8CCBC] ${
                isExpanded 
                    ? 'bottom-4 right-4 left-4 md:left-auto md:right-6 md:w-[860px] h-[88vh] max-h-[820px]' 
                    : 'bottom-4 right-4 md:right-6 w-[94vw] md:w-[440px] h-[85vh] max-h-[680px]'
            }`}
        >
            {/* Top Navigation Bar */}
            <div className="bg-primary p-3.5 text-white flex flex-col space-y-2.5 shrink-0 select-none shadow-md">
                <div className="flex justify-between items-center">
                    {/* Left: History toggle & App Branding */}
                    <div className="flex items-center space-x-2.5">
                        <button
                            onClick={toggleHistory}
                            title={isHistoryOpen ? "Close chat history" : "Open ChatGPT-style chat history"}
                            className={`p-1.5 rounded-lg transition-all flex items-center space-x-1.5 text-xs font-medium ${
                                isHistoryOpen 
                                    ? 'bg-white/20 text-white shadow-inner' 
                                    : 'bg-white/10 hover:bg-white/20 text-white/90'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="hidden sm:inline">History</span>
                            {sessions.length > 0 && (
                                <span className="bg-white/25 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                                    {sessions.length}
                                </span>
                            )}
                        </button>

                        <div className="h-4 w-px bg-white/20"></div>

                        <div className="flex items-center space-x-2">
                            <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${
                                status === 'listening' || status === 'speaking' 
                                    ? 'bg-red-400 animate-pulse' 
                                    : 'bg-emerald-400'
                            }`}></div>
                            <h3 className="font-bold text-base tracking-tight text-white">Bill Pro AI</h3>
                        </div>
                    </div>

                    {/* Right: + New Chat, Expand & Close */}
                    <div className="flex items-center space-x-1">
                        <button
                            onClick={startNewChat}
                            title="Start new chat"
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 transition-all flex items-center space-x-1 text-xs font-medium"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            <span className="hidden sm:inline">New</span>
                        </button>

                        <button 
                            onClick={() => setIsExpanded(prev => !prev)} 
                            title={isExpanded ? "Collapse panel" : "Expand to ChatGPT widescreen"}
                            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors hidden sm:flex items-center justify-center"
                        >
                            {isExpanded ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                </svg>
                            )}
                        </button>

                        <button 
                            onClick={toggleAi} 
                            title="Close Bill Pro AI"
                            className="hover:bg-white/15 p-1.5 rounded-lg transition-colors text-white/80 hover:text-white"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Subheader: Interaction Mode Selector */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex bg-primary-dark/80 rounded-lg p-0.5 text-xs font-medium shadow-neo-inset max-w-[200px] w-full">
                        <button 
                            onClick={() => setInteractionMode('voice')}
                            className={`flex-1 py-1 rounded-md transition-all text-[11px] ${interactionMode === 'voice' ? 'bg-primary shadow-sm text-white font-semibold' : 'text-gray-300 hover:text-white'}`}
                        >Voice</button>
                        <button 
                            onClick={() => setInteractionMode('text')}
                            className={`flex-1 py-1 rounded-md transition-all text-[11px] ${interactionMode === 'text' ? 'bg-primary shadow-sm text-white font-semibold' : 'text-gray-300 hover:text-white'}`}
                        >Text</button>
                        <button 
                            onClick={() => setInteractionMode('both')}
                            className={`flex-1 py-1 rounded-md transition-all text-[11px] ${interactionMode === 'both' ? 'bg-primary shadow-sm text-white font-semibold' : 'text-gray-300 hover:text-white'}`}
                        >Both</button>
                    </div>

                    {/* Active session context label */}
                    {activeSession && (
                        <div className="text-[11px] text-white/80 truncate max-w-[190px] text-right font-medium">
                            {activeSession.title}
                        </div>
                    )}
                </div>
            </div>

            {/* Main Body Layout: Split screen if expanded, or switchable view */}
            <div className="flex-1 flex overflow-hidden relative bg-surface">
                {/* ChatGPT-style History Sidebar */}
                {(isHistoryOpen || isExpanded) && (
                    <div 
                        className={`${
                            isExpanded 
                                ? 'w-64 md:w-72 border-r border-[#E2D7C8] flex flex-col shrink-0' 
                                : 'absolute inset-0 z-20 bg-surface flex flex-col'
                        }`}
                    >
                        <AiChatHistorySidebar onClose={() => !isExpanded && setIsHistoryOpen(false)} />
                    </div>
                )}

                {/* Main Chat Conversation View */}
                <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
                    {/* Active Conversation Banner when viewing a specific chat (e.g. Yesterday's chat) */}
                    {activeSession && (
                        <div className="bg-[#FAF5EC] border-b border-[#E8DDCE] px-3.5 py-2 flex items-center justify-between text-xs text-primary-dark shrink-0">
                            <div className="flex items-center space-x-2 min-w-0">
                                <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                                <div className="truncate">
                                    <span className="font-bold text-primary-dark">{activeSession.title}</span>
                                    <span className="text-secondary text-[11px] ml-1.5">
                                        ({formatSessionDateLabel(activeSession.updatedAt || activeSession.createdAt)})
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={startNewChat}
                                className="text-primary hover:text-primary-dark text-[11px] font-bold shrink-0 hover:underline flex items-center space-x-1"
                            >
                                <span>+ New Chat</span>
                            </button>
                        </div>
                    )}

                    {/* Status & Volume Indicator */}
                    {(status === 'listening' || status === 'understanding' || status === 'speaking' || status === 'working') && (
                        <div className="bg-primary/5 border-b border-primary/20 px-3 py-1.5 flex items-center justify-between text-xs text-primary shrink-0">
                            <div className="flex items-center space-x-2 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-primary animate-ping"></span>
                                <span>
                                    {status === 'listening' && 'Listening to you...'}
                                    {status === 'understanding' && 'Analyzing intent...'}
                                    {status === 'working' && 'Processing your request...'}
                                    {status === 'speaking' && 'Speaking response...'}
                                </span>
                            </div>
                            {volumeLevel > 0 && (
                                <div className="w-24 bg-primary/20 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                        className="bg-primary h-full transition-all duration-75"
                                        style={{ width: `${Math.min(100, volumeLevel * 100)}%` }}
                                    ></div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Messages Scroll Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-sidebar-scrollbar">
                        {messages.length === 0 && !transcript && !aiResponse ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-secondary space-y-4 my-auto">
                                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-neo-surface">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                    </svg>
                                </div>
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm text-primary-dark">Welcome to Bill Pro AI</h4>
                                    <p className="text-xs text-secondary max-w-xs">
                                        Ask questions about sales, stock, invoices, or perform voice/text business actions!
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-center max-w-xs pt-2">
                                    {[
                                        "What were yesterday sales?",
                                        "Show pending invoices",
                                        "Create invoice for customer",
                                        "Check trophy inventory"
                                    ].map((prompt, pIdx) => (
                                        <button
                                            key={pIdx}
                                            onClick={() => sendText(prompt)}
                                            className="text-xs bg-[#FAF5EC] hover:bg-primary/10 border border-[#E2D7C8] hover:border-primary/30 rounded-lg px-2.5 py-1.5 text-primary-dark text-left transition-colors"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => {
                                const isUser = msg.type === 'user';
                                const formattedTime = msg.timestamp ? formatMessageTime(msg.timestamp) : '';

                                return (
                                    <div 
                                        key={msg.id || idx} 
                                        className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} group`}
                                    >
                                        <div className="flex items-end gap-2 max-w-[88%]">
                                            {!isUser && (
                                                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-1 shadow-sm">
                                                    BP
                                                </div>
                                            )}

                                            <div 
                                                className={`relative rounded-2xl p-3.5 text-sm font-medium ${
                                                    isUser 
                                                        ? 'bg-surface border border-[#D8CCBC] shadow-neo-raised text-primary-dark rounded-br-none' 
                                                        : 'bg-primary/10 border border-primary/25 shadow-neo-inset text-primary-dark rounded-bl-none'
                                                }`}
                                            >
                                                <div className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                                                    {msg.text}
                                                </div>

                                                {/* Message Timestamp & Copy Tool */}
                                                <div className="flex items-center justify-between gap-3 mt-1.5 pt-1 border-t border-black/5 text-[10px] text-secondary">
                                                    <span>{formattedTime}</span>
                                                    {!isUser && (
                                                        <button
                                                            onClick={() => copyToClipboard(msg.text, idx)}
                                                            className="hover:text-primary transition-colors flex items-center space-x-1"
                                                            title="Copy response"
                                                        >
                                                            {copiedIndex === idx ? (
                                                                <span className="text-primary font-bold">Copied!</span>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {isUser && (
                                                <div className="w-6 h-6 rounded-full bg-secondary/30 flex items-center justify-center text-primary-dark text-[10px] font-bold shrink-0 mb-1">
                                                    You
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Confirmation Card */}
                    {status === 'waiting_for_confirmation' && pendingAction && (
                        <div className="m-3 neo-card !p-3 space-y-2 border border-warning/40 bg-warning/10 shrink-0">
                            <p className="font-bold text-warning text-xs">Confirm Business Action</p>
                            <p className="text-xs text-primary-dark">{pendingAction.summary}</p>
                            <div className="flex space-x-2 pt-1">
                                <button 
                                    onClick={confirmAction}
                                    className="flex-1 neo-btn-primary !px-2 !py-1 text-xs"
                                >
                                    Confirm
                                </button>
                                <button 
                                    onClick={cancelAction}
                                    className="flex-1 neo-btn !px-2 !py-1 text-xs"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Controls & Input */}
                    <div className="p-3 bg-surface border-t border-[#E2D7C8] flex flex-col space-y-2.5 shrink-0">
                        {/* Voice Session Toggle */}
                        {(interactionMode === 'voice' || interactionMode === 'both') && (
                            <div className="flex items-center justify-between">
                                {status === 'disconnected' || status === 'error' ? (
                                    <button 
                                        onClick={startSession}
                                        className="w-full neo-btn-primary !py-2 text-xs flex items-center justify-center space-x-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                            <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                                            <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.62v2.13h1.5a.75.75 0 010 1.5h-4.5a.75.75 0 010-1.5h1.5v-2.13a6.751 6.751 0 01-6-6.62v-1.5A.75.75 0 016 10.5z" />
                                        </svg>
                                        <span>Start Voice Session</span>
                                    </button>
                                ) : (
                                    <button 
                                        onClick={stopSession}
                                        className="w-full neo-btn text-error !py-1.5 text-xs flex items-center justify-center space-x-1.5 font-semibold"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                                            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                                        </svg>
                                        <span>Stop Voice Session</span>
                                    </button>
                                )}
                            </div>
                        )}
                        
                        {/* Text Message Input */}
                        <div className="flex w-full space-x-2 items-center">
                            <input 
                                type="text" 
                                className="flex-1 neo-input !py-2.5 !px-3 text-xs md:text-sm"
                                placeholder={activeSession ? `Reply in "${activeSession.title}"...` : "Message Bill Pro AI..."}
                                value={textInput}
                                onChange={e => setTextInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && textInput.trim()) {
                                        sendText(textInput.trim());
                                        setTextInput('');
                                    }
                                }}
                            />
                            <button 
                                onClick={() => {
                                    if (textInput.trim()) {
                                        sendText(textInput.trim());
                                        setTextInput('');
                                    }
                                }}
                                disabled={!textInput.trim()}
                                className="neo-btn-primary !px-4 !py-2.5 text-xs md:text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
