import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAi } from '../../contexts/AiContext';

export const VoiceAssistantButton: React.FC = () => {
    const { toggleAi, isOpen } = useAi();
    const location = useLocation();

    if (isOpen) return null;

    // Hide floating button on invoice and document generation/edit pages
    // so it does not block the "Generate Invoice" / primary action buttons
    const isDocFormPage = [
        '/invoices/new',
        '/invoices/edit',
        '/quotations/new',
        '/quotations/edit',
        '/proforma-invoices/new',
        '/proforma-invoices/edit',
        '/cash-memos/new',
        '/cash-memos/edit',
        '/purchases/new',
        '/purchases/edit',
    ].some((path) => location.pathname.startsWith(path));

    if (isDocFormPage) return null;

    return (
        <button
            onClick={toggleAi}
            aria-label="Ask Bill Pro AI Assistant"
            className="fixed bottom-28 md:bottom-6 right-4 md:right-6 px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 neo-btn-primary z-40 flex items-center justify-center space-x-2 shadow-lg transition-transform hover:scale-105 active:scale-95 text-xs sm:text-sm"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 sm:w-6 sm:h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
            <span className="font-semibold">Ask Bill Pro</span>
        </button>
    );
};
