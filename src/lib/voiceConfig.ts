/**
 * Bill Pro Voice Agent — Configuration
 */

export const VOICE_CONFIG = {
  /** WebSocket URL for the Cloud Run voice proxy */
  WS_URL: import.meta.env.VITE_VOICE_WS_URL || 'ws://localhost:8080/ws',

  /** Audio input: 16kHz PCM mono (what Gemini Live expects) */
  SAMPLE_RATE_IN: 16000,

  /** Audio output: 24kHz PCM mono (what Gemini Live sends) */
  SAMPLE_RATE_OUT: 24000,

  /** How often to send audio chunks (ms) */
  CHUNK_INTERVAL_MS: 100,

  /** Buffer size for audio worklet (samples) */
  BUFFER_SIZE: 4096,

  /** Max session duration (ms) — 15 minutes */
  MAX_SESSION_DURATION: 15 * 60 * 1000,

  /** Heartbeat interval (ms) */
  HEARTBEAT_INTERVAL: 30000,

  /** Reconnect attempts */
  MAX_RECONNECT_ATTEMPTS: 3,

  /** Reconnect delay (ms) */
  RECONNECT_DELAY: 1000,
} as const;

/** Voice engine states */
export type VoiceState = 
  | 'idle'          // Not connected, ready to start
  | 'connecting'    // Opening WebSocket + Gemini session
  | 'listening'     // Mic active, streaming audio to Gemini
  | 'processing'    // Gemini is processing (brief transition)
  | 'ai_speaking'   // AI is responding with audio
  | 'error';        // Something went wrong

/** Events emitted by VoiceEngine */
export interface VoiceEngineEvents {
  stateChange: (state: VoiceState) => void;
  transcript: (text: string, role: 'user' | 'model', isFinal: boolean) => void;
  audioLevel: (level: number) => void;
  action: (action: string, data: any) => void;
  error: (error: string) => void;
  ready: () => void;
  turnComplete: () => void;
  interrupted: () => void;
  sessionEnded: (reason: string) => void;
}
