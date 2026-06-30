# MeloNote

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![Expo Router](https://img.shields.io/badge/expo--router-v56-blue.svg)](https://docs.expo.dev/router/introduction/)
[![Flask Backend](https://img.shields.io/badge/flask-v2.0-orange.svg)](https://flask.palletsprojects.com/)
[![PyTorch AI](https://img.shields.io/badge/pytorch-v2.0-red.svg)](https://pytorch.org/)
[![License](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)

A modern, professional-grade AI-powered music transcription and sheet music workspace. MeloNote bridges the gap between acoustic performance, physical scores, and digital editing, enabling musicians to record, digitize, compose, and manage sheet music dynamically within a unified mobile-friendly environment.


## Acknowledgements

MeloNote is built using several excellent open-source projects, including Expo, React Native, Flask, Verovio, Audiveris, OpenCV, and many other libraries. We thank their respective authors and communities for their contributions.

---

## Overview

MeloNote is designed for musicians, composers, teachers, and students. By combining advanced AI models with dynamic WebAssembly music rendering and image processing, it provides a comprehensive workspace where you can:

1. **Acoustically Transcribe**: Record a piano performance and watch the AI process it into a grand staff MusicXML score.
2. **Scan & Digitize**: Use your device's camera or upload sheet music images to automatically run preprocessing and Optical Music Recognition (OMR).
3. **Edit & Compose**: Manually edit, add notes, select staves, and manage compositions directly on an interactive canvas powered by the Verovio WebAssembly engine.
4. **Sync & Export**: Keep your projects saved locally and export them as MIDI, synthesized WAV playback, MusicXML, or a fully packaged ZIP project containing PDF scores and audio assets.

---

## Architecture

MeloNote employs a decoupled client-server architecture. The **React Native (Expo)** client manages the user interface, WebAssembly rendering context, local project database, and audio recording. The **Flask** backend processes heavy computational workloads, hosting the AI audio transcriber and the Audiveris OMR pipeline.

### Data Flow Layouts

#### 1. Audio Recording & AI Transcription Pipeline
```
+------------------+     WAV / MP3     +------------------+     PyTorch CRNN     +-------------------+
|                  | ----------------> |  Flask Backend   | -------------------> | ByteDance Model   |
|   Expo Client    |                   |   (/analyze)     |                      | (MAESTRO-trained) |
| (Record Screen)  |                   +------------------+                      +-------------------+
|                  |                                                                       | Note Events
|                  |     MusicXML      +------------------+     JSON Notes         |
|   Score Editor   | <---------------- |  Verovio Wasm    | <----------------------+-------------------+
| (WebView Canvas) |                   | (WebView Engine) |                        | Post-Processing   |
+------------------+                   +------------------+                        | (Tempo, Voice,    |
                                                                                   |  Quantization)    |
                                                                                   +-------------------+
```

#### 2. Scan Sheet OMR Digitization Pipeline
```
+------------------+     Multipart     +------------------+     OpenCV Filters   +-------------------+
|                  | ----------------> |  Flask Backend   | -------------------> | Image Enhancements|
|   Expo Client    |                   |  (/scan/start)   |                      | (CLAHE, Bilateral,|
|  (Camera Crop)   |                   +------------------+                      |  Lanczos Scale)   |
|                  |                                                                       | Clean Binary Image
|   Score Editor   |     MusicXML      +------------------+      XML Score         |
| (WebView Canvas) | <---------------- |   Get Status     | <--------------------+-------------------+
|                  |                   | (/scan/status/)  |                      |  Audiveris OMR    |
+------------------+                   +------------------+                      |   Subprocess      |
                                                                                 +-------------------+
```

#### 3. Manual Score Composition Flow
```
+------------------+     Touch Event     +------------------+     MusicXML Code    +-------------------+
|                  | ------------------> |   Score Editor   | ------------------> |  Verovio Toolkit  |
|   Expo Client    |                     |  (WebView State) |                     |  Wasm Compiler    |
| (Compose Screen) |                     +------------------+                     +-------------------+
|                  |                                                                        | Rendered SVGs
|                  |     Local JSON      +------------------+      Base64 PDF       |
|  Local Storage   | <------------------ |  projects.tsx    | <--------------------+-------------------+
|   (JSON Files)   |                     | (Project State)  |                      |   jsPDF Engine    |
+------------------+                     +------------------+                      +-------------------+
```

---

## Features

### 🎤 Recording & AI Transcription
*   **High-Quality Recording**: Integrated mobile recording using the `expo-audio` module with real-time timers.
*   **Audio File Upload**: Pick and upload existing audio files (`.mp3`, `.wav`, `.m4a`, etc.) using the native Expo Document Picker.
*   **MAESTRO-Trained CRNN Model**: Advanced neural network-driven transcription detecting onset, offset, frame-level activations, and note velocity.
*   **Digital Signal Post-Processing**: Includes tempo estimation (tempogram + IOI voting), time signature classification, adaptive 16th-note grid quantization, and stateful voice separation (left/right hand continuity).

### ✏️ Composition & Editing Workspace
*   **Interactive WebAssembly Notation**: Live grand-staff rendering utilizing the Verovio WebAssembly engine inside a fast-loading, hardware-accelerated `WebView`.
*   **Note Selection & Manipulation**: Select measures, individual notes, or staves. Dynamically add notes, delete entries, and change pitches.
*   **Accidental and Duration Modifiers**: Modify notes with sharps (`#`), flats (`b`), naturals, dots, and duration types ranging from whole to 16th notes.
*   **Title and Author Settings**: Edit metadata directly on the composition canvas.

### 📄 Scan Sheet OMR
*   **Native Image Cropping**: Integrated camera scan and gallery upload utilising native image cropping handles.
*   **OpenCV Preprocessing Pipeline**: Runs perspective warping (deskew), bilateral denoising, contrast enhancement (CLAHE), and high-quality Lanczos upscaling on low-resolution sheets.
*   **Task Queue Polling**: Non-blocking asynchronous task execution with step-by-step progress loaders (`Preparing`, `Detecting Staff Lines`, `Recognizing Symbols`, `Generating MusicXML`).
*   **Intelligent Log Parsing**: Extracts specific errors (e.g. invalid sheets, overlapping lines, missing staves) and exposure metrics to alert the user.

### 📂 Workspace & Project Management
*   **Save & Load State**: Projects are automatically persisted locally using `localStorage` on Web and native `expo-file-system` JSON databases on Android/iOS.
*   **Search, Filter, and Sort**: Filter projects by source type (transcribed or manual), search by name, and sort by date or title.
*   **Multi-Asset Export**: Export scores as MusicXML, MIDI, synthesized WAV playback, or download a packaged ZIP project containing all audio, PDF, and notation components.

### 🔊 Playback Engine
*   **Synthesized WAV Playback**: Renders notation notes back to synthesized audio on the server side using soundfile engines.
*   **Timeline Controls**: Drag the progress bar scrub head to seek playback times. Play, pause, restart, and toggle between the *original recording* and the *synthesized notation* audio.

---

## Technology Stack

| Layer | Technologies & Libraries | Purpose |
| :--- | :--- | :--- |
| **Frontend Core** | React Native, Expo (v56), TypeScript | Mobile platform wrapper, core logic, layout |
| **Routing & Nav** | Expo Router, React Navigation | File-based routing, sidebar navigation sliding drawer |
| **Notation Render** | Verovio WebAssembly Toolkit, Vexflow | Client-side vector rendering of MusicXML scores |
| **UI Animations** | React Native Reanimated, Expo Linear Gradient | High-fidelity micro-interactions and transitions |
| **Media & Audio** | Expo Audio, Expo AV, pitchfinder, fft-js | Audio recording, native playback, pitch detection |
| **Image & Camera** | Expo Camera, Expo Image Picker, Expo Image Manipulator | Capture, crop selection, and rotation |
| **Local Storage** | Expo File System (iOS/Android), localStorage (Web) | Native JSON project file databases |
| **Backend Core** | Python, Flask, Flask-CORS | API endpoints, task queues, CORS permissions |
| **AI Transcription**| PyTorch, piano_transcription_inference, librosa | CRNN model execution, audio spectrogram processing |
| **WAV Synthesizer** | pretty-midi, soundfile | Convert MIDI note sequences to synthetic WAV files |
| **OMR Engine** | Audiveris (OMR Binary Subprocess), OpenCV, Pillow | Image preprocessing (CLAHE, deskew, Lanczos), OMR |

---

## Project Structure

```
MeloNote/
├── app.json                  # Expo application configurations and metadata
├── package.json              # Frontend package dependencies and scripts
├── tsconfig.json             # TypeScript compiler rules
├── assets/                   # App icons, splash screens, and design resources
├── android/                  # Native Android workspace resources
├── src/                      # Frontend TypeScript React Native source code
│   ├── app/                  # Expo Router file-based screens layout
│   │   ├── _layout.tsx       # Root entry, loads GlobalWorkspaceLayout wrapper
│   │   ├── index.tsx         # Dashboard landing/Hero overview page
│   │   ├── create.tsx        # Manual Composition Screen & Interactive Editor
│   │   ├── record.tsx        # Audio Recorder & AI Transcription workspace
│   │   ├── scan.tsx          # OMR Sheet Scanner, camera crop, and polling
│   │   ├── projects.tsx      # Projects folder (list, search, save, and delete)
│   │   └── settings.tsx      # Server Base API URL configurations
│   ├── components/           # Reusable widgets and WebView layouts
│   │   ├── mobile/           # Navigation buttons, BottomNav, SidebarNav, etc.
│   │   ├── ui/               # Design System buttons, Cards, and Gradients
│   │   ├── sheetMusic.tsx    # WebView wrapper rendering Verovio scores
│   │   └── sheetMusicShared.ts # Core HTML, jsPDF, and Verovio interaction scripts
│   ├── constants/            # Design system color palettes and grids
│   ├── hooks/                # React custom hooks
│   └── utils/                # General utility helper methods
└── backend/                  # Flask Python Server Backend
    ├── app.py / server.py    # Flask server setups and routes
    ├── requirements.txt      # Python dependencies list
    ├── analyze.py            # AI piano transcription pipeline & post-processing
    ├── evaluate.py           # Synthesis utilities and metric evaluations
    ├── preprocess.py         # Audio downsampling and loading helpers
    ├── projects/             # Server-side project folder storage
    └── scanner/              # Optical Music Recognition (OMR) modules
        ├── preprocess.py     # OpenCV filters (CLAHE, bilaterial, Lanczos upscaling)
        ├── audiveris.py      # Audiveris subprocess wrapper
        ├── parser.py         # MusicXML note validating and empty checks
        └── scanner_service.py # OMR job queue runner and log classifier
```

---

## Installation

### Prerequisites
*   **Node.js**: v18+ recommended.
*   **Python**: v3.8–v3.11.
*   **Audiveris**: Ensure Audiveris is installed and the executable path is configured correctly in `MeloNote/backend/scanner/audiveris.py` (Default: `C:\Program Files\Audiveris\Audiveris.exe`).
*   **FFmpeg**: Ensure `ffmpeg` is installed and added to your system's PATH.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/MeloNote.git
cd MeloNote
```

### 2. Configure and Run the Backend Server
Set up a Python virtual environment and install the required dependencies:
```bash
cd backend
python -m venv venv

# Activate Virtual Environment (Windows PowerShell)
.\venv\Scripts\Activate.ps1

# Activate Virtual Environment (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
# Additional system dependencies
pip install torch torchaudio soundfile librosa piano-transcription-inference networkx

# Launch Flask Server
python server.py
```
The server will start running on all local interfaces on `http://127.0.0.1:5000` (or `http://192.168.1.X:5000`).

### 3. Configure and Run the Frontend App
Open a new terminal session, navigate back to the MeloNote root, and install npm packages:
```bash
# Navigate to the frontend directory
cd MeloNote

# Install dependencies
npm install

# Start the Expo Dev Server
npm run start
```
*   **Connecting Frontend to Backend**: Go to the **Settings** screen inside the app and enter your Flask server's local IP address (e.g. `http://192.168.1.X:5000`) so your device can communicate with the backend.

---

## Usage

### 1. Audio Transcription Workflow
1. Navigate to the **Record** tab.
2. Select **Monophonic** or **Polyphonic** mode.
3. Tap **Record Audio** to capture a piano melody, or use **Upload Audio File** to select an existing file.
4. Tap **Transcribe Score**. The client will upload the audio and display the `MusicLoadingAnimation` stage tracker.
5. When complete, the app loads the score directly into the **Score Editor**, displaying dynamic staves, overall quality indicators, and playbacks.

### 2. Sheet Scanning Workflow
1. Navigate to the **Scan Sheet** tab.
2. Choose **Scan with Camera** or **Upload from Gallery**.
3. Select your score boundaries using the crop frames.
4. Tap **Transcribe Score**. The status tracker will display the four OMR phases: `Preparing`, `Detecting Staves`, `Recognizing Symbols`, and `Generating MusicXML`.
5. Once Audiveris finishes, the sheet editor loads the score. If the resolution was low, a warning is returned before loading the notation.

### 3. Composition Workflow
1. Navigate to the **Compose** tab.
2. Tap **New Score** to initialize a blank workspace, or open an existing project from the **Projects** tab.
3. Toggle the **Edit/View** button.
4. Click on any bar or note to select it. Modify its pitch, change its duration, add modifiers (flats/sharps/dots), or append rests.
5. Save changes locally or click **Export Options** to download PDF/MIDI/WAV packages.

---

## Current Progress

### Implemented Features
*   [x] **Acoustic Audio Recording**: Expo-audio recording integration.
*   [x] **Audio Upload**: Pick audio files natively from mobile device storage.
*   [x] **AI Music Transcription**: CRNN-based transcription with digital signal post-processing.
*   [x] **Dynamic Sheet Editor**: Verovio WebAssembly rendering inside WebView.
*   [x] **Interactive Composition**: Add, delete, and alter notes using staves click interactions.
*   [x] **OMR Scanning**: Audiveris image digitization pipeline.
*   [x] **Local Workspace Storage**: Persistence using localStorage (web) and JSON files (mobile).
*   [x] **Multi-format Exports**: Exporting to PDF, MIDI, WAV, and packaged ZIPs.
*   [x] **Workspace Navigation**: Sliding sidebar drawer with Reanimated springs.
*   [x] **Timeline Playback**: Interactive progress bar scrub head and play modes.
*   [x] **Low-Res Upscaling**: OpenCV Lanczos interpolation, CLAHE enhancements, and warning systems.

### Planned Features (Coming Soon)
*   [ ] **AI Practice Evaluation**: Real-time instrument play feedback and accuracy tracking.
*   [ ] **Ear Training**: Exercises to identify intervals, chords, and keys.
*   [ ] **Music Theory Quizzes**: Gamified tests to verify sight-reading capabilities.
*   [ ] **Progress Tracking Dashboards**: Visual stats, frequencies, and real-time trends.

---

## Future Roadmap

*   **AI Practice Evaluation**: Real-time microphone listening to evaluate user performance against a loaded sheet music file.
*   **Music Theory Quizzes**: Dynamic lessons to practice sight-reading and chord spelling.
*   **Ear Training**: Gamified intervals and keys training.
*   **Multi-Page Image Scanning**: Audiveris book scanner compatibility.
*   **Cloud Sync**: Syncing JSON project databases across multiple devices.

---

## Contributing

We welcome contributions to MeloNote! Please follow these guidelines:
1. Fork the repository and create your feature branch: `git checkout -b feature/AmazingFeature`.
2. Commit your changes: `git commit -m 'Add some AmazingFeature'`.
3. Push to the branch: `git push origin feature/AmazingFeature`.
4. Open a Pull Request.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
