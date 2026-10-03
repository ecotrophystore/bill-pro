import React from 'react';
import { useAi } from '../../contexts/AiContext';

export const VoiceAssistantPanel: React.FC = () => {
    const { 
        isOpen, toggleAi, status, 
        transcript, aiResponse, 
        pendingAction, confirmAction, cancelAction,
        startSession, stopSession, sendText, volumeLevel
    } = useAi();
    
    const [textInput, setTextInput] = React.useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed bottom-6 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col z-50 overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${status === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-green-400'}`}></div>
                    <h3 className="font-semibold text-lg">Bill Pro AI</h3>
                </div>
                <button onClick={toggleAi} className="hover:bg-indigo-700 p-1 rounded-md transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content Area */}
            <div className="p-4 flex-1 flex flex-col space-y-4 min-h-[300px]">
                
                {/* Status Indicator */}
                <div className="flex flex-col items-center">
                    <div className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
                        {status === 'idle' && 'Ready'}
                        {status === 'listening' && 'Listening...'}
                        {status === 'understanding' && 'Understanding...'}
                        {status === 'working' && 'Working...'}
                        {status === 'waiting_for_confirmation' && 'Awaiting Confirmation'}
                        {status === 'error' && 'Error'}
                    </div>
                    {/* Volume Meter */}
                    {(status === 'listening' || status === 'idle' || status === 'understanding') && (
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                            <div 
                                className="bg-indigo-600 h-1.5 rounded-full transition-all duration-75" 
                                style={{ width: `${Math.min(100, volumeLevel * 100)}%` }}
                            ></div>
                        </div>
                    )}
                </div>

                {/* Transcripts & Responses */}
                <div className="flex-1 overflow-y-auto space-y-3">
                    {transcript && (
                        <div className="flex justify-end">
                            <div className="bg-gray-100 p-3 rounded-xl rounded-tr-none text-gray-800 text-sm max-w-[80%]">
                                "{transcript}"
                            </div>
                        </div>
                    )}
                    {aiResponse && (
                        <div className="flex justify-start">
                            <div className="bg-indigo-50 p-3 rounded-xl rounded-tl-none text-indigo-900 text-sm max-w-[90%]">
                                {aiResponse}
                            </div>
                        </div>
                    )}
                </div>

                {/* Confirmation Card */}
                {status === 'waiting_for_confirmation' && pendingAction && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-2 mt-2">
                        <p className="font-semibold text-yellow-800 text-sm">Confirm Action</p>
                        <p className="text-xs text-yellow-700">{pendingAction.summary}</p>
                        <div className="flex space-x-2 pt-2">
                            <button 
                                onClick={confirmAction}
                                className="flex-1 bg-indigo-600 text-white text-sm py-1.5 rounded-md hover:bg-indigo-700"
                            >
                                Confirm
                            </button>
                            <button 
                                onClick={cancelAction}
                                className="flex-1 bg-gray-200 text-gray-800 text-sm py-1.5 rounded-md hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col space-y-3">
                {status === 'disconnected' || status === 'error' ? (
                    <button 
                        onClick={startSession}
                        className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center space-x-2"
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
                        className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg font-medium hover:bg-red-200 flex items-center justify-center space-x-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                        </svg>
                        <span>Stop</span>
                    </button>
                )}
                
                {status !== 'disconnected' && status !== 'connecting' && (
                    <div className="flex w-full mt-2 space-x-2">
                        <input 
                            type="text" 
                            className="flex-1 bg-white border border-gray-300 rounded-md px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
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
                            className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-indigo-700 font-medium"
                        >
                            Send
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
