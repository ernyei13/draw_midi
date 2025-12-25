# drawMidi

**drawMidi** is an augmented reality MIDI controller that transforms hand-drawn sketches on paper into functional digital interfaces. Using the Google Gemini API for computer vision and MediaPipe for real-time hand tracking, you can "play" your paper drawings and stream MIDI data to your favorite DAW or synthesizer.

## Features

- **Analog-to-Digital Mapping**: Draw buttons, sliders, and knobs on paper and scan them instantly.
- **Gesture Interaction**: Use natural "pinch" gestures to toggle buttons, move sliders, and rotate knobs.
- **Zero Latency Tracking**: High-performance hand tracking via MediaPipe.
- **Web MIDI Output**: Streams MIDI CC messages directly to your system's MIDI ports.
- **Minimalist Design**: A clean, distraction-free HUD that stays out of your way.

<img width="1352" height="795" alt="Screenshot 2025-12-25 at 18 05 04" src="https://github.com/user-attachments/assets/c74e5f58-a03a-45c3-9d6e-31edf1f5e4cf" />


<img width="1352" height="797" alt="Screenshot 2025-12-25 at 18 08 24" src="https://github.com/user-attachments/assets/1439d966-c886-47b5-bcda-cced7a0472fb" />

## How it Works

1. **Draw**: Use a dark pen or marker on white paper.
   - **Buttons**: Simple rectangles or squares.
   - **Sliders**: Long horizontal or vertical slots/bars.
   - **Knobs**: Circular dials.
2. **Scan**: Position your webcam over the paper and press **Space** (or click Sync). The Gemini API analyzes your drawing and maps interactive AR overlays.
3. **Perform**: 
   - Hover your index finger over a control.
   - **Pinch** (index finger to thumb) to engage.
   - Once engaged, your movement is locked to that control until you release the pinch.

## MIDI Implementation

- **Channel**: 1
- **Control Change (CC)**: Starts at CC #20 for the first detected element, incrementing for each subsequent control.
- **Range**: 0–127 (normalized from 0–100% in the UI).

## Setup & Local Development

### Prerequisites

- A modern web browser with **Web MIDI** and **Camera API** support (Chrome, Edge, or Opera recommended).
- A valid **Google Gemini API Key**.

### Running on a New Machine

1. **Clone the project files** into a directory.
2. **Set the API Key**: The application expects the Gemini API key to be available in the environment. If running locally with a build tool like Vite, add `API_KEY=your_key_here` to your `.env` file.
3. **Serve the application**:
   Since the project uses ES6 modules directly in the HTML, you can serve it using any static file server:
   ```bash
   # Using npx (Node.js)
   npx serve .

   # Or using Python
   python -m http.server
   ```
4. **Access**: Open `http://localhost:3000` (or the port provided by your server) in your browser.
5. **Permissions**: Grant camera access when prompted.

## Technical Stack

- **React 19**: UI Layer.
- **@google/genai**: Vision analysis for UI detection.
- **MediaPipe Hands**: Real-time skeletal hand tracking.
- **Lucide React**: Iconography.
- **Tailwind CSS**: Styling.

---
*Created with Gemini 2.5 Flash & MediaPipe.*
