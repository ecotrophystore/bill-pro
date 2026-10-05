export interface SpeechVolumeCallbackPayload {
  isSpeaking: boolean;
  audioVolume: number;
}

export type SpeechVolumeCallback = (payload: SpeechVolumeCallbackPayload) => void;

export class BillProSpeechEngine {
  private synth: SpeechSynthesis;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private oscillationIntervalId: number | null = null;
  private currentWordLength: number = 0;
  private isProcessingSpeech: boolean = false;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
    } else {
      throw new Error("Web Speech API structural endpoints are missing in this browser environment.");
    }
  }

  public speak(text: string, onVolumeChange: SpeechVolumeCallback): void {
    this.stop(); 

    this.currentUtterance = new SpeechSynthesisUtterance(text);
    this.isProcessingSpeech = true;

    const voices = this.synth.getVoices();
    const optimalVoice = voices.find(v => v.lang.startsWith('ta-IN') || v.lang.startsWith('en-IN') || v.lang.startsWith('en-US'));
    if (optimalVoice) this.currentUtterance.voice = optimalVoice;

    this.currentUtterance.rate = 1.0; 
    this.currentUtterance.pitch = 1.0; 

    this.currentUtterance.onboundary = (event) => {
      if (event.name === 'word') {
        const remainingText = text.slice(event.charIndex);
        const nextWord = remainingText.split(/\s+/)[0] || "";
        this.currentWordLength = nextWord.length;
      }
    };

    this.currentUtterance.onstart = () => {
      this.startVolumeOscillator(onVolumeChange);
    };

    this.currentUtterance.onend = () => {
      this.cleanup(onVolumeChange);
    };

    this.currentUtterance.onerror = () => {
      this.cleanup(onVolumeChange);
    };

    this.synth.speak(this.currentUtterance);
  }

  private startVolumeOscillator(callback: SpeechVolumeCallback): void {
    let tickCounter = 0;

    this.oscillationIntervalId = window.setInterval(() => {
      if (!this.isProcessingSpeech) return;

      tickCounter += 0.25;

      const baseWave = Math.sin(tickCounter);
      const lengthModifier = Math.min(this.currentWordLength * 8, 45); 
      const naturalJitter = Math.cos(tickCounter * 2.5) * 10;

      let calculatedVolume = Math.floor((baseWave * 30) + 40 + lengthModifier + naturalJitter);
      
      if (this.currentWordLength === 0) {
        calculatedVolume = 0;
      }

      callback({
        isSpeaking: true,
        audioVolume: Math.min(Math.max(calculatedVolume, 0), 100)
      });
    }, 30); 
  }

  public stop(): void {
    if (this.oscillationIntervalId) {
      clearInterval(this.oscillationIntervalId);
      this.oscillationIntervalId = null;
    }
    if (this.synth) {
      this.synth.cancel();
    }
    this.isProcessingSpeech = false;
  }

  private cleanup(callback: SpeechVolumeCallback): void {
    this.stop();
    callback({ isSpeaking: false, audioVolume: 0 });
  }
}
