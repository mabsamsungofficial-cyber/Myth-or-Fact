# Myth or Fact Maker 🎬📱

Turn any topic into a finished vertical (9:16, 720×1280) "Myth or Fact" Short/Reel video entirely on your device with synchronized motion graphics and sound.

---

## 🌟 Key Highlights

- **Pure Canvas Animation Engine**:
  - Exact 720×1280 9:16 vertical resolution.
  - Pure function of time `t` with seeded pseudo-random math (`CM.rng` xoshiro128**, no `Math.random`).
  - Dynamic timeline calculation: `0.8s title + 5.8s × N rounds + 3.0s score recap`.
  - Distressed stamp rendering with offscreen particle specks revealing the card below.
  - Renders comfortably in well under 10 ms per frame.
- **Gemini Live / Native Audio Voiceover**:
  - Natural human-like spoken voiceover narration in Hinglish, Hindi, or English.
  - HD Voice Personas: `Puck` (youthful & engaging, best for Shorts/Reels), `Aoede`, `Charon`, `Kore`, and `Fenrir`.
  - Automatically synchronized with on-screen card transitions, guess bar pauses, and stamp slams.
  - Mixed into exported videos alongside synthesized sound effects.
- **Synthesized Web Audio (Zero Audio Assets Needed)**:
  - Procedural sound design using Web Audio API: curiosity pad, title slam, paper pops, guess ticks, rubber stamp slam, fact ding / myth buzzer, and score chord.
- **Offline Bundled Fonts**:
  - `Archivo Black`, `Inter` (600–800), `Anton`, `Playfair Display` (900), and `Noto Sans Devanagari` (700, 800) bundled in the app. No CDNs, 100% offline-ready.
- **Two-Step Grounded Gemini AI**:
  - **Step 1 (Research)**: Google Search Grounding to find verified, peer-reviewed facts and real source URLs.
  - **Step 2 (Format)**: Strict JSON schema formatting with hard constraints: statement lines max 18 chars, proof lines max 32 chars.
  - **Auto-Retry & Text Fit Validation**: Automatically checks text geometry against 540 px card inner width; retries with correction feedback if lines exceed boundaries.
- **Video Export**:
  - Real-time `canvas.captureStream(30)` synchronized with `AudioContext.createMediaStreamDestination()`.
  - Automatic best MIME type selection (`video/mp4;codecs=avc1` or `video/webm;codecs=vp9`).
  - Native save to device storage via `@capacitor/filesystem` and sharing via `@capacitor/share`.
- **API Key Security**:
  - Gemini API keys are stored only in device secure storage (Android Keystore / Capacitor Preferences). Never hardcoded, never logged, never committed.

---

## 🛠️ Project Structure

```text
├── android/                   # Capacitor Android Native Project
├── public/
│   └── fonts/                 # Bundled offline woff2 fonts
├── src/
│   ├── engine/
│   │   ├── renderFrame.ts     # Pure canvas 720x1280 frame renderer
│   │   ├── sound.ts           # Web Audio procedural sound synthesizer
│   │   ├── textFit.ts         # Measure & shrink-to-fit (min 46px card, 30px proof)
│   │   ├── timeline.ts        # Dynamic timeline calculator
│   │   └── types.ts           # Core TypeScript data schemas
│   ├── services/
│   │   ├── aiProvider.ts      # Unified AI facade
│   │   ├── geminiClient.ts    # Two-step grounded research & format client
│   │   ├── mockData.ts        # Bundled English, Hinglish, & Hindi datasets
│   │   ├── storage.ts         # Keystore-backed secure preferences
│   │   └── videoExporter.ts   # Canvas + Web Audio MediaRecorder service
│   ├── ui/                    # UI screens (Home, Review, Preview, Export, Settings)
│   └── main.ts                # Application lifecycle & font preloader
└── capacitor.config.ts        # Capacitor mobile configuration
```

---

## 🚀 Running the Web App

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

### 3. Run Test Suite
```bash
npm test
```
Verifies Gemini schema validation, character limits, text-fitting bounds, and export formats.

---

## 📱 Building & Installing the Android APK

### Prerequisites
- Node.js 18+
- Java JDK 17 (Temurin 17 or OpenJDK 17)
- Android SDK installed (`android` CLI or Android Studio)

### Step 1: Build the Web Distribution
```bash
npm run build
```

### Step 2: Sync Web Assets to Android Project
```bash
npx cap sync android
```

### Step 3: Compile the Android APK

#### Option A: Using Gradle CLI (Recommended & Fastest)
On Windows:
```powershell
cd android
.\gradlew assembleDebug
```
On Linux/macOS:
```bash
cd android
./gradlew assembleDebug
```

The generated APK will be located at:
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

#### Option B: Using Android Studio
```bash
npx cap open android
```
Click **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

---

## 📲 Installing on Your Phone

### Via USB Debugging (ADB)
1. Connect your Android phone to your PC with USB debugging enabled.
2. Verify connection:
   ```bash
   adb devices
   ```
3. Install the APK:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Via Direct File Transfer
Copy `app-debug.apk` to your phone via USB or WhatsApp/Drive and tap to install.

---

## ⚙️ Testing Modes

1. **Mock Mode (Default)**:
   - Go to Settings (⚙️) to ensure **Mock Mode** is checked.
   - Works 100% offline with zero API keys required.
   - Provides verified real research samples for English, Hinglish, and Hindi.
2. **Live Gemini AI Mode**:
   - Open Settings (⚙️).
   - Enter your personal Google Gemini API key.
   - Uncheck Mock Mode.
   - Enter any topic (e.g. *Sleep*, *Sunscreen*, *Coffee*, *Workout*) to run live research!
