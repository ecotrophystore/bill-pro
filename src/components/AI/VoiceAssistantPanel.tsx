import React from 'react';
import { useAi } from '../../contexts/AiContext';

export const VoiceAssistantPanel: React.FC = () => {
    const { 
        isOpen, toggleAi, status, 
        interactionMode, setInteractionMode,
        transcript, aiResponse, 
        pendingAction, confirmAction, cancelAction,
        startSession, stopSession, sendText, volumeLevel
    } = useAi();

    
    const [textInput, setTextInput] = React.useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-6 right-6 w-96 neo-card flex flex-col z-50 overflow-hidden !p-0">
            {/* Header */}
            <div className="bg-primary p-4 flex flex-col space-y-3 text-surface">
                <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full shadow-neo-surface ${status === 'listening' || status === 'speaking' ? 'bg-red-400 animate-pulse' : 'bg-green-400'}`}></div>
                        <h3 className="font-semibold text-lg text-white">Bill Pro AI</h3>
                    </div>
                    <button onClick={toggleAi} className="hover:bg-primary-dark p-1 rounded-md transition-colors text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                {/* Interaction Mode Selector */}
                <div className="flex bg-primary-dark rounded-lg p-1 text-xs font-medium shadow-neo-inset">
                    <button 
                        onClick={() => setInteractionMode('voice')}
                        className={`flex-1 py-1 rounded-md transition-all ${interactionMode === 'voice' ? 'bg-primary shadow-neo-surface text-white' : 'text-gray-300 hover:text-white'}`}
                    >Voice</button>
                    <button 
                        onClick={() => setInteractionMode('text')}
                        className={`flex-1 py-1 rounded-md transition-all ${interactionMode === 'text' ? 'bg-primary shadow-neo-surface text-white' : 'text-gray-300 hover:text-white'}`}
                    >Text</button>
                    <button 
                        onClick={() => setInteractionMode('both')}
                        className={`flex-1 py-1 rounded-md transition-all ${interactionMode === 'both' ? 'bg-primary shadow-neo-surface text-white' : 'text-gray-300 hover:text-white'}`}
                    >Both</button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 flex-1 flex flex-col space-y-4 min-h-[300px] bg-surface">
                
                {/* Status Indicator */}
                <div className="flex flex-col items-center">
                    <div className="text-sm font-semibold text-secondary uppercase tracking-wider mb-2">
                        {status === 'idle' && 'Ready'}
                        {status === 'listening' && 'Listening...'}
                        {status === 'understanding' && 'Understanding...'}
                        {status === 'working' && 'Working...'}
                        {status === 'waiting_for_confirmation' && 'Awaiting Confirmation'}
                        {status === 'error' && 'Error'}
                    </div>
                    {/* Volume Meter */}
                    {(status === 'listening' || status === 'idle' || status === 'understanding') && (
                        <div className="w-full neo-input !p-0 h-2 mb-2 overflow-hidden flex items-center">
                            <div 
                                className="bg-primary h-full rounded-full transition-all duration-75" 
                                style={{ width: `${Math.min(100, volumeLevel * 100)}%` }}
                            ></div>
                        </div>
                    )}
                </div>

                {/* Transcripts & Responses */}
                <div className="flex-1 overflow-y-auto space-y-3 custom-sidebar-scrollbar pr-2">
                    {transcript && (
                        <div className="flex justify-end">
                            <div className="neo-card !p-3 !rounded-tr-none text-primary-dark font-medium text-sm max-w-[80%]">
                                "{transcript}"
                            </div>
                        </div>
                    )}
                    {aiResponse && (
                        <div className="flex justify-start">
                            <div className="bg-primary/10 border border-primary/20 shadow-neo-inset rounded-xl rounded-tl-none p-3 text-primary-dark font-medium text-sm max-w-[90%]">
                                {aiResponse}
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirmation Card */}
                {status === 'waiting_for_confirmation' && pendingAction && (
                    <div className="neo-card !p-3 space-y-2 mt-2 border border-warning/30 bg-warning/5">
                        <p className="font-semibold text-warning text-sm">Confirm Action</p>
                        <p className="text-xs text-primary-dark">{pendingAction.summary}</p>
                        <div className="flex space-x-2 pt-2">
                            <button 
                                onClick={confirmAction}
                                className="flex-1 neo-btn-primary !px-2 !py-1.5 text-sm"
                            >
                                Confirm
                            </button>
                            <button 
                                onClick={cancelAction}
                                className="flex-1 neo-btn !px-2 !py-1.5 text-sm"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-4 bg-surface border-t border-shadow-dark flex flex-col space-y-3">
                {status === 'disconnected' || status === 'error' ? (
                    <button 
                        onClick={startSession}
                        className="w-full neo-btn-primary flex items-center justify-center space-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                            <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.62v2.13h1.5a.75.75 0 010 1.5h-4.5a.75.75 0 010-1.5h1.5v-2.13a6.751 6.751 0 01-6-6.62v-1.5A.75.75 0 016 10.5z" />
                        </svg>
                        <span>Start Session</span>
                    </button>
                ) : (
                    <button 
                        onClick={stopSession}
                        className="w-full neo-btn text-error flex items-center justify-center space-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                        </svg>
                        <span>Stop</span>
                    </button>
                )}
                
                {status !== 'disconnected' && status !== 'connecting' && (
                    <div className="flex w-full mt-2 space-x-3 items-center">
                        <input 
                            type="text" 
                            className="flex-1 neo-input text-sm"
                            placeholder="Type a message..."
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
                            className="neo-btn-primary !px-4 !py-2.5 text-sm whitespace-nowrap"
                        >
                            Send
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
