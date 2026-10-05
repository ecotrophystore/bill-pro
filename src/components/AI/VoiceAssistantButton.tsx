import React from 'react';
import { useAi } from '../../contexts/AiContext';

export const VoiceAssistantButton: React.FC = () => {
    const { toggleAi, isOpen } = useAi();

    if (isOpen) return null;

    return (
        <button
            onClick={toggleAi}
            className="fixed bottom-6 right-6 px-6 py-3 neo-btn-primary z-50 flex items-center justify-center space-x-2"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="font-semibold">Ask Bill Pro</span>
        </button>
    );
};
