import React, { useEffect } from 'react';
import { Mic, StopCircle } from 'lucide-react';
import { useVoice } from '../../hooks/useVoice';

interface FieldMicButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
}

export default function FieldMicButton({ onTranscript, className }: FieldMicButtonProps) {
  const { isListening, transcript, startListening, stopListening, isSupported } = useVoice();

  const onTranscriptRef = React.useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    if (transcript) {
      onTranscriptRef.current(transcript);
    }
  }, [transcript]);

  if (!isSupported) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        if (isListening) {
          stopListening();
        } else {
          startListening();
        }
      }}
      className={className || "p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex items-center justify-center border border-transparent active:scale-95"}
      title={isListening ? "Stop listening" : "Start voice input"}
    >
      {isListening ? (
        <span className="relative flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 flex items-center justify-center">
            <StopCircle size={10} className="text-white" />
          </span>
        </span>
      ) : (
        <Mic size={16} className="text-primary hover:text-primary-dark transition-colors" />
      )}
    </button>
  );
}
