import type { EngineSettings, TimelineData, VideoData } from '../engine/types.ts';
import { renderFrame } from '../engine/renderFrame.ts';
import { buildSound, SFX } from '../engine/sound.ts';

export interface VideoExportProgress {
  currentTime: number;
  duration: number;
  percent: number;
}

export interface VideoExportResult {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: string;
  label: string;
  duration: number;
  sizeBytes: number;
}

export function getBestSupportedMimeType(): { mimeType: string; extension: string; label: string } {
  const candidates = [
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4', label: 'MP4 (H.264 / AAC)' },
    { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4', label: 'MP4 (H.264)' },
    { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM (VP9 / Opus)' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM (VP8 / Opus)' },
    { mimeType: 'video/webm', extension: 'webm', label: 'WebM' }
  ];

  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    }
  }

  return { mimeType: 'video/webm', extension: 'webm', label: 'WebM (Default)' };
}

export class VideoExporter {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async record(
    canvas: HTMLCanvasElement,
    videoData: VideoData,
    tl: TimelineData,
    settings: EngineSettings,
    onProgress: (p: VideoExportProgress) => void
  ): Promise<VideoExportResult> {
    this.isCancelled = false;
    const duration = tl.D;
    const bestFormat = getBestSupportedMimeType();

    // 1. Setup Audio Destination & Routing
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const audioDest = audioCtx.createMediaStreamDestination();

    // 2. Setup Canvas Stream at 30 FPS
    const canvasStream = canvas.captureStream ? canvas.captureStream(30) : (canvas as any).mozCaptureStream(30);

    // 3. Combine Video & Audio Tracks
    const combinedTracks = [
      ...canvasStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks()
    ];
    const combinedStream = new MediaStream(combinedTracks);

    // 4. Setup MediaRecorder with selected MIME type and high bitrate (6 Mbps)
    const options: MediaRecorderOptions = {
      mimeType: bestFormat.mimeType,
      videoBitsPerSecond: 6_000_000
    };

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(combinedStream, options);
    } catch (e) {
      // Fallback if specific options fail
      recorder = new MediaRecorder(combinedStream);
    }

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    return new Promise<VideoExportResult>((resolve, reject) => {
      recorder.onstop = () => {
        try {
          audioCtx.close();
        } catch {}

        if (this.isCancelled) {
          reject(new Error('Export cancel kar diya gaya.'));
          return;
        }

        const fullBlob = new Blob(chunks, { type: recorder.mimeType || bestFormat.mimeType });
        const videoUrl = URL.createObjectURL(fullBlob);

        resolve({
          blob: fullBlob,
          url: videoUrl,
          mimeType: recorder.mimeType || bestFormat.mimeType,
          extension: bestFormat.extension,
          label: bestFormat.label,
          duration,
          sizeBytes: fullBlob.size
        });
      };

      recorder.onerror = (event: any) => {
        try {
          audioCtx.close();
        } catch {}
        reject(new Error(`Recording error: ${event?.error?.message || 'MediaRecorder failed'}`));
      };

      // Start recording with 500ms chunk intervals
      recorder.start(500);

      // Start synthesized audio in sync with recorder
      const hasVoiceover = !!(videoData.voiceoverUrl || videoData.voiceoverBlob);
      let voElement: HTMLAudioElement | null = null;

      if (videoData.voiceoverUrl) {
        try {
          voElement = new Audio(videoData.voiceoverUrl);
          const voSource = audioCtx.createMediaElementSource(voElement);
          voSource.connect(audioDest);
          voElement.currentTime = 0;
          voElement.play().catch(() => {});
        } catch (e) {
          console.warn('Voiceover media source routing error', e);
        }
      }

      const scoreSound = (kit: any) => buildSound(kit, videoData, tl);
      const stopAudio = SFX.live(scoreSound, 0, { dest: audioDest, voiceover: hasVoiceover }, audioCtx);

      const ctx = canvas.getContext('2d')!;
      const startTime = performance.now();

      // Render loop in sync with real-time audio
      const renderLoop = (now: number) => {
        if (this.isCancelled) {
          stopAudio();
          if (voElement) voElement.pause();
          recorder.stop();
          return;
        }

        const elapsed = (now - startTime) / 1000;
        const currentT = Math.min(elapsed, duration);

        renderFrame(ctx, currentT, videoData, tl, settings);

        const percent = Math.min(100, Math.round((currentT / duration) * 100));
        onProgress({
          currentTime: currentT,
          duration,
          percent
        });

        if (elapsed >= duration + 0.1) {
          stopAudio();
          if (voElement) voElement.pause();
          recorder.stop();
        } else {
          requestAnimationFrame(renderLoop);
        }
      };

      requestAnimationFrame(renderLoop);
    });
  }
}

export const videoExporter = new VideoExporter();
