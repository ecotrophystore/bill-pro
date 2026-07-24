import React from 'react';
import FieldMicButton from './FieldMicButton';

interface SpeechInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onSpeechChange?: (val: string) => void;
}

function cleanNumericSpeech(text: string): string {
  let clean = text.trim().toLowerCase();

  // Strip commas and extract first number sequence (e.g. "₹ 150.50", "150 rupees" -> "150.50")
  const digitsMatch = clean.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (digitsMatch) {
    return digitsMatch[0];
  }

  // Fallback map for simple digit words
  const wordMap: Record<string, string> = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10'
  };
  
  if (wordMap[clean]) {
    return wordMap[clean];
  }

  return clean;
}

export default function SpeechInput({ onSpeechChange, className, ...props }: SpeechInputProps) {
  const classes = className ? className.split(' ') : [];
  const widthClass = classes.find(c => c.startsWith('w-')) || 'w-full';
  const restClasses = classes.filter(c => !c.startsWith('w-')).join(' ');

  return (
    <div className={`relative flex items-center ${widthClass}`}>
      <input
        {...props}
        className={`${restClasses} w-full pr-8`}
      />
      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center z-10">
        <FieldMicButton
          onTranscript={(text) => {
            let processedText = text;
            if (props.type === 'number') {
              processedText = cleanNumericSpeech(text);
            }
            
            if (onSpeechChange) {
              onSpeechChange(processedText);
            } else if (props.onChange) {
              const event = {
                target: { value: processedText }
              } as React.ChangeEvent<HTMLInputElement>;
              props.onChange(event);
            }
          }}
        />
      </div>
    </div>
  );
}

