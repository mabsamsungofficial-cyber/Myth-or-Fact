import type { EngineSettings, TimelineData, VideoData } from '../engine/types.ts';
import { VideoExportProgress, VideoExportResult, videoExporter, getBestSupportedMimeType } from '../services/videoExporter.ts';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export function renderExportScreen(
  container: HTMLElement,
  videoData: VideoData,
  tl: TimelineData,
  settings: EngineSettings,
  onBackToPreview: () => void,
  onGoHome: () => void
) {
  let isRecording = true;
  let currentProgress: VideoExportProgress = { currentTime: 0, duration: tl.D, percent: 0 };
  let exportResult: VideoExportResult | null = null;
  let exportError: string | null = null;

  const bestFormat = getBestSupportedMimeType();

  function update() {
    container.innerHTML = `
      <header class="app-header">
        <div class="brand">
          <button id="backBtn" class="icon-btn" ${isRecording ? 'disabled' : ''}>← Preview</button>
          <h1 style="font-size:18px;">Video Export</h1>
        </div>
        <span class="brand-badge">${bestFormat.extension.toUpperCase()}</span>
      </header>

      <main>
        ${
          isRecording
            ? `
              <div class="card" style="text-align:center;padding:28px 16px;">
                <h2 style="font-size:18px;font-weight:700;margin:0 0 8px;">Rendering Video</h2>
                <p style="font-size:13px;color:var(--dim);margin:0 0 20px;">
                  Recording 720×1280 frames and synchronizing audio in real time...
                </p>

                <!-- Hidden canvas used for recording -->
                <div style="position:relative;width:180px;aspect-ratio:720/1280;margin:0 auto 20px;border-radius:10px;overflow:hidden;border:1px solid var(--line);">
                  <canvas id="exportCanvas" width="720" height="1280" style="width:100%;height:100%;display:block;"></canvas>
                </div>

                <!-- Progress Bar -->
                <div style="background:var(--panel-alt);border-radius:8px;height:12px;overflow:hidden;margin-bottom:10px;border:1px solid var(--line);">
                  <div id="progressBar" style="background:var(--accent);height:100%;width:${currentProgress.percent}%;transition:width 0.2s;"></div>
                </div>

                <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--dim);margin-bottom:20px;">
                  <span id="percentText">${currentProgress.percent}%</span>
                  <span id="timeText">${currentProgress.currentTime.toFixed(1)}s / ${currentProgress.duration.toFixed(1)}s</span>
                </div>

                <div style="font-size:12px;color:#9aa3ad;margin-bottom:16px;">
                  Target: <strong>${bestFormat.label}</strong> (720×1280 @ 30fps)
                </div>

                <button id="cancelExportBtn" class="btn btn-secondary" style="max-width:180px;margin:0 auto;">
                  Cancel Render
                </button>
              </div>
            `
            : exportResult
            ? `
              <div class="card" style="padding:20px 16px;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
                  <div>
                    <h2 style="font-size:18px;font-weight:800;margin:0;">Video Ready</h2>
                    <div style="font-size:12px;color:var(--dim);margin-top:2px;">
                      Format: <span style="color:var(--accent);font-weight:700;">${exportResult.label}</span> · Size: ${(exportResult.sizeBytes / (1024 * 1024)).toFixed(1)} MB
                    </div>
                  </div>
                </div>

                <!-- Video Preview -->
                <div style="position:relative;aspect-ratio:720/1280;max-height:50vh;margin:0 auto 16px;background:#000;border-radius:12px;overflow:hidden;border:1px solid var(--line);">
                  <video id="videoPreviewEl" src="${exportResult.url}" controls playsinline style="width:100%;height:100%;display:block;object-fit:contain;"></video>
                </div>

                <div style="display:flex;flex-direction:column;gap:10px;">
                  <button id="saveVideoBtn" class="btn btn-primary">
                    Save Video to Device
                  </button>

                  <button id="shareVideoBtn" class="btn btn-secondary">
                    Share Video
                  </button>

                  <div style="display:flex;gap:10px;margin-top:6px;">
                    <button id="backPreviewBtn" class="btn btn-secondary">
                      ← Preview
                    </button>
                    <button id="homeBtn" class="btn btn-secondary">
                      New Video
                    </button>
                  </div>
                </div>
              </div>
            `
            : `
              <div class="card" style="text-align:center;padding:24px 16px;">
                <h2 style="font-size:18px;font-weight:700;color:var(--red);margin:0 0 10px;">Export Error</h2>
                <p style="font-size:14px;color:var(--dim);margin:0 0 20px;">
                  ${exportError || 'An error occurred while rendering the video.'}
                </p>
                <button id="retryExportBtn" class="btn btn-primary" style="margin-bottom:10px;">
                  Retry Export
                </button>
                <button id="cancelBackBtn" class="btn btn-secondary">
                  Back to Preview
                </button>
              </div>
            `
        }
      </main>
    `;

    container.querySelector('#backBtn')?.addEventListener('click', onBackToPreview);

    if (isRecording) {
      container.querySelector('#cancelExportBtn')?.addEventListener('click', () => {
        videoExporter.cancel();
        isRecording = false;
        exportError = 'Export was cancelled.';
        update();
      });
    }

    if (exportResult) {
      container.querySelector('#saveVideoBtn')?.addEventListener('click', () => {
        downloadVideoFile(exportResult!);
      });

      container.querySelector('#shareVideoBtn')?.addEventListener('click', () => {
        shareVideoFile(exportResult!, videoData.topic);
      });

      container.querySelector('#backPreviewBtn')?.addEventListener('click', onBackToPreview);
      container.querySelector('#homeBtn')?.addEventListener('click', onGoHome);
    }

    if (exportError) {
      container.querySelector('#retryExportBtn')?.addEventListener('click', startExport);
      container.querySelector('#cancelBackBtn')?.addEventListener('click', onBackToPreview);
    }
  }

  /**
   * Writes large binary Blobs to native filesystem safely using 256KB base64 chunks
   * to avoid overflowing the Android WebView bridge IPC buffer.
   */
  async function writeLargeBlobToFile(
    blob: Blob,
    filePath: string,
    directory: Directory
  ): Promise<string> {
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        const b64 = res.indexOf(',') >= 0 ? res.split(',')[1] : res;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const CHUNK_SIZE = 262144; // 256 KB clean chunks (multiple of 4)
    const totalLength = base64Data.length;

    // 1. Initial chunk creates/overwrites file
    const firstChunk = base64Data.slice(0, Math.min(CHUNK_SIZE, totalLength));
    await Filesystem.writeFile({
      path: filePath,
      data: firstChunk,
      directory
    });

    // 2. Subsequent chunks append seamlessly
    for (let offset = CHUNK_SIZE; offset < totalLength; offset += CHUNK_SIZE) {
      const nextChunk = base64Data.slice(offset, Math.min(offset + CHUNK_SIZE, totalLength));
      await Filesystem.appendFile({
        path: filePath,
        data: nextChunk,
        directory
      });
    }

    const { uri } = await Filesystem.getUri({
      path: filePath,
      directory
    });

    return uri;
  }

  async function downloadVideoFile(res: VideoExportResult) {
    const safeTopic = (videoData.topic || 'Video').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Myth_or_Fact_${safeTopic}_${Date.now()}.${res.extension}`;

    if (Capacitor.isNativePlatform()) {
      try {
        const uri = await writeLargeBlobToFile(res.blob, filename, Directory.Documents);
        alert(`✓ Video saved successfully to Documents folder!\nFilename: ${filename}\n\nTip: You can tap "Share Video" to send directly to WhatsApp, Reels or Drive.`);
        return uri;
      } catch (err: any) {
        console.warn('Native save to Documents failed, falling back to share:', err);
        await shareVideoFile(res, videoData.topic);
      }
      return;
    }

    // Web browser download fallback
    const a = document.createElement('a');
    a.href = res.url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function shareVideoFile(res: VideoExportResult, topic?: string) {
    const safeTopic = (topic || 'Video').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Myth_or_Fact_${safeTopic}_${Date.now()}.${res.extension}`;

    if (Capacitor.isNativePlatform()) {
      try {
        // Write chunked to Cache directory so Android FileProvider can share it
        const fileUri = await writeLargeBlobToFile(res.blob, filename, Directory.Cache);

        await Share.share({
          title: 'Myth or Fact Video',
          text: `Watch this Myth or Fact video about ${topic || 'Health'}!`,
          files: [fileUri],
          dialogTitle: 'Share Video'
        });
        return;
      } catch (err: any) {
        console.warn('Capacitor native share failed:', err);
        alert('Share error: ' + (err?.message || 'Could not open share menu'));
      }
      return;
    }

    try {
      const file = new File([res.blob], filename, { type: res.mimeType });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Myth or Fact Video',
          text: `Myth or Fact: ${topic || 'Health'}`,
          files: [file]
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Myth or Fact Video',
          text: `Myth or Fact: ${topic || 'Health'}`
        });
      } else {
        await downloadVideoFile(res);
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        await downloadVideoFile(res);
      }
    }
  }

  async function startExport() {
    isRecording = true;
    exportResult = null;
    exportError = null;
    currentProgress = { currentTime: 0, duration: tl.D, percent: 0 };
    update();

    const canvas = container.querySelector('#exportCanvas') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const result = await videoExporter.record(
        canvas,
        videoData,
        tl,
        settings,
        (progress) => {
          currentProgress = progress;
          const bar = container.querySelector('#progressBar') as HTMLElement;
          const pText = container.querySelector('#percentText') as HTMLElement;
          const tText = container.querySelector('#timeText') as HTMLElement;
          if (bar) bar.style.width = `${progress.percent}%`;
          if (pText) pText.textContent = `${progress.percent}%`;
          if (tText) tText.textContent = `${progress.currentTime.toFixed(1)}s / ${progress.duration.toFixed(1)}s`;
        }
      );

      isRecording = false;
      exportResult = result;
      update();
    } catch (err: any) {
      isRecording = false;
      exportError = err?.message || 'Video export failed.';
      update();
    }
  }

  startExport();
}
