import { buildTimeline } from '../engine/timeline.ts';
import { renderFrame } from '../engine/renderFrame.ts';
import { buildSound, SFX } from '../engine/sound.ts';
import type { VideoData } from '../engine/types.ts';
import { storage } from '../services/storage.ts';

export function renderPreviewScreen(
  container: HTMLElement,
  videoData: VideoData,
  onBackToReview: () => void,
  onExportRequested?: () => void
) {
  const settings = storage.getSettings();
  const tl = buildTimeline(videoData);
  const DURATION = tl.D;

  container.innerHTML = `
    <header class="app-header">
      <div class="brand">
        <button id="backToReviewBtn" class="icon-btn">← Claims</button>
        <h1 style="font-size:18px;">Video Preview</h1>
      </div>
      <span class="brand-badge">${DURATION.toFixed(1)}s</span>
    </header>

    <main class="player-container">
      <div class="stage-wrapper">
        <canvas id="previewCanvas" width="720" height="1280" aria-label="Myth or Fact video preview"></canvas>
      </div>

      <div class="transport-bar">
        <button id="playBtn" type="button">Play</button>
        <input id="scrubBar" type="range" min="0" max="${DURATION}" step="0.01" value="0" aria-label="Scrub timeline" />
        <span id="timeDisplay" class="time-display">0.00 / ${DURATION.toFixed(2)}</span>
        <button id="soundToggleBtn" type="button" aria-pressed="true">Sound on</button>
        <button id="loopToggleBtn" type="button" aria-pressed="true">Loop</button>
        <label class="btn-tool" for="voFileInput">
          Load Audio
          <input id="voFileInput" class="hidden-file-input" type="file" accept="audio/*" />
        </label>
      </div>

      <div id="voNotice" style="font-size:12px;color:var(--dim);margin:0 4px;">
        ${
          videoData.voiceoverUrl
            ? `Voiceover active (${videoData.voiceoverPersona || 'Puck'}). Synchronized with sound effects.`
            : `Synchronized sound effects active.`
        }
      </div>

      <div style="display:flex;gap:10px;margin-top:12px;">
        <button id="editClaimsBtn" class="btn btn-secondary">
          Edit Claims
        </button>
        <button id="exportVideoBtn" class="btn btn-primary">
          Export Video
        </button>
      </div>
    </main>
  `;

  const canvas = container.querySelector('#previewCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  const playBtn = container.querySelector('#playBtn') as HTMLButtonElement;
  const scrubBar = container.querySelector('#scrubBar') as HTMLInputElement;
  const timeDisplay = container.querySelector('#timeDisplay') as HTMLElement;
  const soundToggleBtn = container.querySelector('#soundToggleBtn') as HTMLButtonElement;
  const loopToggleBtn = container.querySelector('#loopToggleBtn') as HTMLButtonElement;
  const voFileInput = container.querySelector('#voFileInput') as HTMLInputElement;
  const voNotice = container.querySelector('#voNotice') as HTMLElement;
  const backToReviewBtn = container.querySelector('#backToReviewBtn') as HTMLButtonElement;
  const editClaimsBtn = container.querySelector('#editClaimsBtn') as HTMLButtonElement;
  const exportVideoBtn = container.querySelector('#exportVideoBtn') as HTMLButtonElement;

  let T = 0;
  let playing = false;
  let lastTime = 0;
  let soundOn = true;
  let loopOn = true;
  let stopSound: (() => void) | null = null;
  let voAudio: HTMLAudioElement | null = null;
  let animId: number | null = null;

  if (videoData.voiceoverUrl) {
    voAudio = new Audio(videoData.voiceoverUrl);
  }

  const scoreSound = (kit: any) => buildSound(kit, videoData, tl);

  (window as any).seek = (t: number) => {
    T = Math.min(Math.max(0, t), DURATION);
    renderFrame(ctx, T, videoData, tl, { stampMode: settings.stampMode });
  };
  (window as any).DURATION = DURATION;
  (window as any).scoreSound = scoreSound;
  (window as any).SFX = SFX;

  const fmtTime = (t: number) => `${t.toFixed(2)} / ${DURATION.toFixed(2)}`;

  function drawCurrent() {
    renderFrame(ctx, T, videoData, tl, { stampMode: settings.stampMode });
    scrubBar.value = T.toString();
    timeDisplay.textContent = fmtTime(T);
  }

  function stopAudio() {
    if (stopSound) {
      stopSound();
      stopSound = null;
    }
    if (voAudio) {
      voAudio.pause();
    }
  }

  function startAudio() {
    stopAudio();
    if (!playing) return;
    if (soundOn) {
      stopSound = SFX.live(scoreSound, T, { voiceover: !!voAudio });
    }
    if (voAudio) {
      try {
        voAudio.currentTime = T;
        voAudio.play().catch(() => {});
      } catch (e) {}
    }
  }

  function setPlaying(p: boolean) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : 'Play';
    lastTime = performance.now();
    if (p) {
      startAudio();
    } else {
      stopAudio();
    }
  }

  function tick(now: number) {
    if (playing) {
      T += (now - lastTime) / 1000;
      lastTime = now;
      if (T >= DURATION) {
        if (loopOn) {
          T = 0;
          startAudio();
        } else {
          T = DURATION;
          setPlaying(false);
        }
      }
      drawCurrent();
    }
    animId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    if (!playing && T >= DURATION) T = 0;
    setPlaying(!playing);
  });

  scrubBar.addEventListener('input', () => {
    T = parseFloat(scrubBar.value);
    drawCurrent();
    if (playing) startAudio();
  });

  soundToggleBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggleBtn.setAttribute('aria-pressed', soundOn.toString());
    soundToggleBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
    if (playing) startAudio();
  });

  loopToggleBtn.addEventListener('click', () => {
    loopOn = !loopOn;
    loopToggleBtn.setAttribute('aria-pressed', loopOn.toString());
  });

  voFileInput.addEventListener('change', () => {
    const file = voFileInput.files && voFileInput.files[0];
    if (!file) return;
    if (voAudio) {
      voAudio.pause();
      URL.revokeObjectURL(voAudio.src);
    }
    voAudio = new Audio(URL.createObjectURL(file));
    voNotice.textContent = `Custom audio: ${file.name}`;
    if (playing) startAudio();
  });

  const cleanup = () => {
    setPlaying(false);
    if (animId) cancelAnimationFrame(animId);
    if (voAudio) {
      voAudio.pause();
    }
  };

  backToReviewBtn.addEventListener('click', () => {
    cleanup();
    onBackToReview();
  });

  editClaimsBtn.addEventListener('click', () => {
    cleanup();
    onBackToReview();
  });

  exportVideoBtn.addEventListener('click', () => {
    cleanup();
    if (onExportRequested) {
      onExportRequested();
    }
  });

  T = Math.min(5.4, DURATION);
  drawCurrent();
  animId = requestAnimationFrame((n) => {
    lastTime = n;
    tick(n);
  });
}
