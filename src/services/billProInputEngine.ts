export interface IntentPayload { 
    intent: 'SET_TAX_RATE' | 'ADD_ITEM' | 'TOGGLE_GST_TYPE' | 'UNKNOWN'; 
    value: string; 
    fieldId: string; 
} 

export type RecognitionCallback = (text: string, intent: IntentPayload) => void; 

export class BillProInputEngine { 
    private recognition: any = null; 
    private isListening: boolean = false; 
    private currentLanguage: string = 'en-IN'; 

    constructor() { 
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; 
        if (SpeechRecognition) { 
            this.recognition = new SpeechRecognition(); 
            this.recognition.continuous = false; 
            this.recognition.interimResults = false; 
        } else { 
            console.warn("Native Speech Recognition is unsupported in this browser environment."); 
        } 
    } 

    public setLanguage(lang: 'en-IN' | 'ta-IN'): void { 
        this.currentLanguage = lang; 
        if (this.recognition) { 
            this.recognition.lang = lang; 
        } 
    } 

    public listen(onResult: RecognitionCallback, onError?: (err: string) => void): void { 
        if (!this.recognition || this.isListening) return; 
        
        this.recognition.lang = this.currentLanguage; 
        this.isListening = true; 
        
        this.recognition.onresult = (event: any) => { 
            const rawText = event.results[0][0].transcript; 
            const cleanedText = this.sanitizeSpokenPhrase(rawText); 
            const interpretedIntent = this.parseVoiceIntent(cleanedText); 
            onResult(cleanedText, interpretedIntent); 
        }; 
        
        this.recognition.onerror = (event: any) => { 
            this.isListening = false; 
            if (onError) onError(event.error); 
        }; 
        
        this.recognition.onend = () => { 
            this.isListening = false; 
        }; 
        
        this.recognition.start(); 
    } 

    private sanitizeSpokenPhrase(text: string): string { 
        let cleaned = text.toLowerCase().trim(); 
        cleaned = cleaned.replace(/\b(percentage|percent|per cent)\b/g, '%'); 
        cleaned = cleaned.replace(/\b(gstin|gst number|g s t i n)\b/g, 'gstin'); 
        cleaned = cleaned.replace(/ஜிஎஸ்டி|ஜி எஸ் டி/g, 'gst'); 
        cleaned = cleaned.replace(/வரி/g, 'tax'); 
        return cleaned; 
    } 

    private parseVoiceIntent(phrase: string): IntentPayload { 
        const taxMatch = phrase.match(/(?:set tax to|tax rate|ஜிஎஸ்டி|வரி)\s*(\d+)\s*%/); 
        if (taxMatch) { 
            return { intent: 'SET_TAX_RATE', value: `GST_${taxMatch[1]}`, fieldId: 'txt_tax_group' }; 
        } 
        if (phrase.includes('interstate') || phrase.includes('igst') || phrase.includes('ஐஜிஎஸ்டி')) { 
            return { intent: 'TOGGLE_GST_TYPE', value: 'IGST', fieldId: 'sel_gst_type' }; 
        } 
        if (phrase.includes('local tax') || phrase.includes('cgst') || phrase.includes('சிஜிஎஸ்டி')) { 
            return { intent: 'TOGGLE_GST_TYPE', value: 'CGST/SGST', fieldId: 'sel_gst_type' }; 
        } 
        return { intent: 'UNKNOWN', value: phrase, fieldId: '' }; 
    } 

    public stop(): void { 
        if (this.recognition && this.isListening) { 
            this.recognition.stop(); 
            this.isListening = false; 
        } 
    } 
}
