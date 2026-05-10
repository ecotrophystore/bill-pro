# Voice Architecture Note: EcoBill Pattu

## Overview
EcoBill Pattu utilizes a **hybrid browser-based voice architecture** designed for turn-based interactions. This is a non-WebRTC pattern that prioritizes ease of deployment and native browser integration over real-time duplex audio streaming.

## Technical Stack
1.  **Speech-to-Text (STT)**:
    -   Implemented via the **Web Speech API** (`SpeechRecognition` / `webkitSpeechRecognition`).
    -   **Important**: This is not necessarily local processing. In most modern browsers (e.g., Chrome), audio is sent to vendor-specific web services for transcription.
    -   **Privacy Note**: Users should be aware that raw audio data may be processed by the browser vendor's cloud engines.
2.  **AI Orchestration**:
    -   The transcribed text is transmitted via HTTPS to a **Firebase Cloud Function**.
    -   **Gemini Flash** handles intent extraction, tool calling (e.g., `navigate`, `update_form_field`), and conversational response generation.
3.  **Speech Synthesis (TTS)**:
    -   Uses the browser's native **Speech Synthesis API** (`window.speechSynthesis`).
    -   **Voice Availability**: Specific voices (like "Google Hindi" or "Google Tamil") are **availability-dependent**. The system attempts to select high-quality voices based on the user's OS and language packs installed.
4.  **Turn-Taking Logic**:
    -   Uses a **silence-based detection loop** with a 2.0s timeout.
    -   This provides a "live" interactive feel but does not support true real-time duplex behavior (e.g., "barge-in" where the AI stops talking immediately when you interrupt).

## Implementation Details
-   **Baseline Status**: `SpeechRecognition` is currently not a Web Baseline feature. Reliability varies across browser engines and may require prefixes or specific user permissions.
-   **Latency**: Designed for turn-based financial workflows. While optimized for "snappy" responses, it is not a low-latency transport layer like WebRTC.
-   **Fallback**: Includes local keyword matching as a failsafe when the Cloud AI is unreachable.
