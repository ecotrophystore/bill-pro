import React, { createContext, useContext, useState } from 'react';

interface FormHighlightContextType {
  activeFieldId: string | null;
  setActiveFieldId: (id: string | null) => void;
  // Used to track if the Voice Agent has just updated a field, to trigger an animation
  updatedFields: Set<string>;
  markFieldUpdated: (id: string) => void;
}

const FormHighlightContext = createContext<FormHighlightContextType | undefined>(undefined);

export function FormHighlightProvider({ children }: { children: React.ReactNode }) {
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [updatedFields, setUpdatedFields] = useState<Set<string>>(new Set());

  const markFieldUpdated = (id: string) => {
    setUpdatedFields((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    
    // Clear the update animation after 2 seconds
    setTimeout(() => {
      setUpdatedFields((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 2000);
  };

  return (
    <FormHighlightContext.Provider value={{ activeFieldId, setActiveFieldId, updatedFields, markFieldUpdated }}>
      {children}
    </FormHighlightContext.Provider>
  );
}

export function useFormHighlight() {
  const context = useContext(FormHighlightContext);
  if (context === undefined) {
    throw new Error('useFormHighlight must be used within a FormHighlightProvider');
  }
  return context;
}
