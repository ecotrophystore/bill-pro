import React, { useState, useMemo } from 'react';
import { useAi } from '../../contexts/AiContext';
import { groupSessionsByDate, formatSessionDateLabel, type AiChatSession } from '../../services/aiChatHistoryService';

interface AiChatHistorySidebarProps {
    onClose?: () => void;
}

export const AiChatHistorySidebar: React.FC<AiChatHistorySidebarProps> = ({ onClose }) => {
    const { 
        sessions, 
        activeSessionId, 
        selectSession, 
        startNewChat, 
        deleteSession, 
        clearAllHistory 
    } = useAi();

    const [searchQuery, setSearchQuery] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Filter by search query
    const filteredSessions = useMemo(() => {
        if (!searchQuery.trim()) return sessions;
        const q = searchQuery.toLowerCase();
        return sessions.filter(s => 
            s.title.toLowerCase().includes(q) ||
            s.messages.some(m => m.text.toLowerCase().includes(q))
        );
    }, [sessions, searchQuery]);

    // Group filtered sessions
    const grouped = useMemo(() => {
        return groupSessionsByDate(filteredSessions);
    }, [filteredSessions]);

    const handleSelect = (id: string) => {
        selectSession(id);
        if (onClose) onClose();
    };

    const handleStartNew = () => {
        startNewChat();
        if (onClose) onClose();
    };

    return (
        <div className="flex flex-col h-full bg-[#FAF6F0] border-r border-[#E2D7C8] select-none text-primary-dark">
            {/* Header */}
            <div className="p-3 border-b border-[#E2D7C8] flex items-center justify-between bg-surface/80 backdrop-blur-sm shrink-0">
                <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <span className="font-bold text-sm tracking-tight text-primary-dark">Chat History</span>
                    <span className="text-xs bg-primary/15 text-primary font-semibold px-1.5 py-0.5 rounded-full">
                        {sessions.length}
                    </span>
                </div>
                {onClose && (
                    <button 
                        onClick={onClose}
                        title="Close History"
                        className="p-1 rounded-md text-secondary hover:text-primary-dark hover:bg-black/5 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Actions: + New Chat & Search */}
            <div className="p-3 space-y-2 shrink-0 border-b border-[#E2D7C8]/70">
                <button
                    onClick={handleStartNew}
                    className="w-full neo-btn-primary !py-2 !px-3 text-xs flex items-center justify-center space-x-2 font-semibold shadow-sm transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    <span>+ New Chat</span>
                </button>

                {/* Search */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-surface border border-[#D8CCBC] placeholder:text-secondary/70 focus:outline-none focus:ring-1 focus:ring-primary shadow-neo-inset"
                    />
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5 text-secondary absolute left-2.5 top-2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-2 text-secondary hover:text-primary-dark"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Conversation Group List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-4 custom-sidebar-scrollbar text-xs">
                {grouped.length === 0 ? (
                    <div className="text-center py-8 px-4 text-secondary">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto mb-2 opacity-50">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3.869-3.225c-1.612.062-3.24.062-4.852 0L6 20.25v-3.091c-.34-.02-.68-.045-1.02-.072C3.847 16.994 3 16.03 3 14.894v-4.286c0-.97.616-1.813 1.5-2.097m15.75 0V6a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6v2.511" />
                        </svg>
                        <p className="font-medium text-xs">No conversations found</p>
                        {searchQuery && (
                            <p className="text-[11px] mt-1 text-secondary/80">Try different search keywords</p>
                        )}
                    </div>
                ) : (
                    grouped.map(({ group, sessions: groupList }) => (
                        <div key={group} className="space-y-1">
                            {/* Group Header */}
                            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-bold text-secondary uppercase tracking-wider">
                                <span className={group === 'Yesterday' ? 'text-primary font-extrabold flex items-center gap-1' : ''}>
                                    {group === 'Yesterday' && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
                                    )}
                                    {group}
                                </span>
                                <span className="text-[10px] bg-black/5 px-1.5 py-0.2 rounded-full font-medium">
                                    {groupList.length}
                                </span>
                            </div>

                            {/* Session Items */}
                            <div className="space-y-1">
                                {groupList.map((session: AiChatSession) => {
                                    const isActive = session.id === activeSessionId;
                                    const isDeleting = confirmDeleteId === session.id;

                                    return (
                                        <div
                                            key={session.id}
                                            onClick={() => handleSelect(session.id)}
                                            className={`group relative rounded-xl p-2.5 cursor-pointer transition-all border ${
                                                isActive
                                                    ? 'bg-primary/10 border-primary/40 shadow-neo-inset text-primary-dark font-medium'
                                                    : 'hover:bg-surface border-transparent hover:border-[#D8CCBC]/60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-1.5">
                                                {/* Title & Metadata */}
                                                <div className="flex-1 min-w-0 pr-1">
                                                    <div className="flex items-center space-x-1.5">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-secondary'}`}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                                                        </svg>
                                                        <p className="truncate text-xs font-semibold text-primary-dark">
                                                            {session.title}
                                                        </p>
                                                    </div>
                                                    <div className="text-[10px] text-secondary mt-1 flex items-center space-x-1.5">
                                                        <span>{formatSessionDateLabel(session.updatedAt || session.createdAt)}</span>
                                                        <span>•</span>
                                                        <span>{session.messages.length} msg{session.messages.length !== 1 ? 's' : ''}</span>
                                                    </div>
                                                </div>

                                                {/* Delete Button */}
                                                <div 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="shrink-0 flex items-center"
                                                >
                                                    {isDeleting ? (
                                                        <div className="flex items-center space-x-1 bg-surface px-1.5 py-0.5 rounded border border-error/40 shadow-sm">
                                                            <button
                                                                onClick={() => {
                                                                    deleteSession(session.id);
                                                                    setConfirmDeleteId(null);
                                                                }}
                                                                className="text-[10px] text-error font-bold hover:underline"
                                                                title="Confirm Delete"
                                                            >
                                                                Del
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDeleteId(null)}
                                                                className="text-[10px] text-secondary hover:text-primary-dark"
                                                                title="Cancel"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmDeleteId(session.id)}
                                                            className="opacity-0 group-hover:opacity-100 p-1 text-secondary hover:text-error rounded transition-opacity"
                                                            title="Delete chat"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3.5 h-3.5">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer with Clear All */}
            {sessions.length > 0 && (
                <div className="p-2 border-t border-[#E2D7C8] bg-surface/60 shrink-0 text-center">
                    {showClearConfirm ? (
                        <div className="flex items-center justify-center space-x-2 py-1">
                            <span className="text-[11px] text-error font-medium">Clear all chats?</span>
                            <button
                                onClick={() => {
                                    clearAllHistory();
                                    setShowClearConfirm(false);
                                }}
                                className="px-2 py-0.5 rounded bg-error text-white text-[10px] font-bold"
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-[10px]"
                            >
                                No
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="text-[11px] text-secondary hover:text-error transition-colors flex items-center justify-center space-x-1 mx-auto"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            <span>Clear chat history</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
