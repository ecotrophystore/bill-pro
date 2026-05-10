import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type VoiceFormAction = {
    fieldName: string;
    value: string;
};

interface VoiceFormContextType {
    lastAction: VoiceFormAction | null;
    setLastAction: (action: VoiceFormAction | null) => void;
    clearLastAction: () => void;
    
    overlayType: 'customer' | 'product' | null;
    setOverlayType: (type: 'customer' | 'product' | null) => void;
    
    confirmationRequested: boolean;
    setConfirmationRequested: (val: boolean) => void;
}

const VoiceFormContext = createContext<VoiceFormContextType | null>(null);

export const useVoiceForm = () => {
    const ctx = useContext(VoiceFormContext);
    if (!ctx) throw new Error('useVoiceForm must be used within VoiceFormProvider');
    return ctx;
};

export function VoiceFormProvider({ children }: { children: ReactNode }) {
    const [lastAction, setLastAction] = useState<VoiceFormAction | null>(null);
    const [overlayType, setOverlayType] = useState<'customer' | 'product' | null>(null);
    const [confirmationRequested, setConfirmationRequested] = useState(false);

    const clearLastAction = () => setLastAction(null);

    return (
        <VoiceFormContext.Provider value={{
            lastAction, setLastAction, clearLastAction,
            overlayType, setOverlayType,
            confirmationRequested, setConfirmationRequested
        }}>
            {children}
        </VoiceFormContext.Provider>
    );
}
