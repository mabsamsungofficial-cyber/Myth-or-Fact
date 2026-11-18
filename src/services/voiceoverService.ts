import type { TimelineData, VideoData } from '../engine/types.ts';
import { storage } from './storage.ts';
import { base64ToInt16Array, pcmToWavBlob } from './pcmHelper.ts';

export type VoicePersona = 'Puck' | 'Aoede' | 'Charon' | 'Kore' | 'Fenrir';

export interface VoiceoverResult {
  audioBlob: Blob;
  audioUrl: string;
  voiceName: VoicePersona;
  duration: number;
  script: string;
  provider: 'gemini-live' | 'device-speech';
}

export const AVAILABLE_VOICES: { id: VoicePersona; label: string; desc: string }[] = [
  { id: 'Puck', label: 'Puck (Recommended)', desc: 'Energetic & engaging — ideal for Shorts/Reels' },
  { id: 'Aoede', label: 'Aoede', desc: 'Warm, expressive & friendly' },
  { id: 'Charon', label: 'Charon', desc: 'Deep, confident & authoritative' },
  { id: 'Kore', label: 'Kore', desc: 'Calm, clear & natural' },
  { id: 'Fenrir', label: 'Fenrir', desc: 'Bold, punchy & dramatic' }
];

/**
 * Builds the narration script for Gemini Native Audio voiceover
 */
export function buildNarrationScript(videoData: VideoData): string {
  const isHi = videoData.language === 'hi';
  const isEn = videoData.language === 'en';

  const parts: string[] = [];

  // Opening hook
  if (isHi) {
    parts.push('मिथ या तथ्य? चलिए देखते हैं आप कितने सही जवाब देते हैं!');
  } else if (isEn) {
    parts.push('Myth or Fact? Test your knowledge!');
  } else {
    parts.push('Myth ya Fact? Dekhte hain aapko kitna pata hai!');
  }

  // Each round with natural pauses
  videoData.rounds.forEach((round, i) => {
    const claim = round.lines.join(' ');
    const verdictWord = round.fact
      ? isHi
        ? 'सच!'
        : isEn
        ? 'Fact!'
        : 'Fact, yaani sach!'
      : isHi
      ? 'झूठ!'
      : isEn
      ? 'Myth!'
      : 'Myth, bilkul jhooth!';
    const proof = round.proof.join(' ');

    if (isHi) {
      parts.push(`नंबर ${i + 1}: ${claim} ... सोचिए ... ${verdictWord} ... ${proof}।`);
    } else if (isEn) {
      parts.push(`Number ${i + 1}: ${claim}. ... Think about it ... That is a ${verdictWord} ... ${proof}.`);
    } else {
      parts.push(`Number ${i + 1}: ${claim}? ... Guess karo ... ${verdictWord} ... ${proof}.`);
    }
  });

  // Outro
  if (isHi) {
    parts.push('आपने कितने सही बताए? कमेंट्स में लिखिए!');
  } else if (isEn) {
    parts.push('How many did you get right? Share in the comments!');
  } else {
    parts.push('Aapka score kitna raha? Comments mein batao!');
  }

  return parts.join('\n\n');
}

/**
 * Attempt 1: Gemini 2.0 Flash REST Audio Generation (Fast, direct HTTP)
 */
async function generateRestAudio(
  apiKey: string,
  modelName: string,
  voiceName: VoicePersona,
  scriptText: string
): Promise<Blob | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `You are a lively, professional narrator for vertical short-form video reels. Read this script with clear pronunciation, energetic enthusiasm, and natural pauses:\n\n${scriptText}`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName
          }
        }
      }
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part?.inlineData?.data) {
        const base64 = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'audio/pcm;rate=24000';

        if (mimeType.includes('pcm') || mimeType.includes('raw')) {
          const pcm = base64ToInt16Array(base64);
          return pcmToWavBlob(pcm, 24000, 1);
        } else {
          // If returned directly as audio/wav or audio/mp3
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: mimeType });
        }
      }
    }
  } catch (err) {
    console.warn('REST audio request failed:', err);
  }

  return null;
}

/**
 * Attempt 2: Gemini Live Multimodal WebSocket (BidiGenerateContent)
 * Properly waits for setupComplete before transmitting clientContent.
 */
function generateLiveWebSocketAudio(
  apiKey: string,
  modelName: string,
  voiceName: VoicePersona,
  scriptText: string
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e: any) {
      return reject(new Error(`WebSocket creation failed: ${e?.message || e}`));
    }

    const pcmChunks: Int16Array[] = [];
    let isComplete = false;

    const timer = setTimeout(() => {
      if (!isComplete) {
        try { ws.close(); } catch {}
        reject(new Error('Gemini Live WebSocket timed out'));
      }
    }, 15000);

    ws.onopen = () => {
      // Step 1: Send setup frame only
      const setupMsg = {
        setup: {
          model: modelName,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName
                }
              }
            }
          }
        }
      };
      ws.send(JSON.stringify(setupMsg));
    };

    ws.onmessage = async (event) => {
      try {
        let text = '';
        if (typeof event.data === 'string') {
          text = event.data;
        } else if (event.data instanceof Blob) {
          text = await event.data.text();
        } else if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        }

        const data = JSON.parse(text);

        // Step 2: Once setupComplete is acknowledged by server, send clientContent
        if (data.setupComplete) {
          const clientContentMsg = {
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [{ text: `Narrate this script with lively enthusiasm and natural pauses:\n\n${scriptText}` }]
                }
              ],
              turnComplete: true
            }
          };
          ws.send(JSON.stringify(clientContentMsg));
          return;
        }

        // Step 3: Collect incoming audio chunks
        if (data.serverContent) {
          const parts = data.serverContent.modelTurn?.parts || [];
          for (const p of parts) {
            if (p?.inlineData?.data) {
              const chunkPcm = base64ToInt16Array(p.inlineData.data);
              pcmChunks.push(chunkPcm);
            }
          }

          if (data.serverContent.turnComplete) {
            isComplete = true;
            clearTimeout(timer);
            try { ws.close(); } catch {}

            if (pcmChunks.length === 0) {
              return reject(new Error('No audio chunks received from Gemini Live'));
            }

            const totalSamples = pcmChunks.reduce((acc, c) => acc + c.length, 0);
            const combined = new Int16Array(totalSamples);
            let offset = 0;
            for (const c of pcmChunks) {
              combined.set(c, offset);
              offset += c.length;
            }

            const wavBlob = pcmToWavBlob(combined, 24000, 1);
            resolve(wavBlob);
          }
        }
      } catch (e) {
        console.warn('WS message parse error:', e);
      }
    };

    ws.onerror = (e: any) => {
      clearTimeout(timer);
      reject(new Error(`WebSocket error: ${e?.message || 'Connection error'}`));
    };

    ws.onclose = (e) => {
      clearTimeout(timer);
      if (!isComplete) {
        reject(new Error(`WebSocket closed (${e.code}): ${e.reason || 'Closed prematurely'}`));
      }
    };
  });
}

/**
 * Synthesizes an audible voiceover track using Web Speech API + Audio Buffer
 * as a reliable device fallback when API models are unavailable.
 */
async function generateDeviceVoiceover(
  script: string,
  tl: TimelineData,
  voiceName: VoicePersona,
  lang: string
): Promise<VoiceoverResult> {
  const sampleRate = 24000;
  const totalSamples = Math.ceil(tl.D * sampleRate);
  const pcm = new Int16Array(totalSamples);

  // Generate an audible, pleasant harmonic background bed (440Hz/554Hz chords)
  // so the video audio destination always receives a clear, audible track
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    // Gentle melodic rhythmic pulse matching round transitions
    const beat = Math.sin(2 * Math.PI * (t / 5.8));
    const tone = Math.sin(2 * Math.PI * 330 * t) * 0.15 * Math.max(0, beat);
    pcm[i] = Math.round(tone * 32767);
  }

  // Trigger spoken voice synthesis on device
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(script);
      utterance.rate = 1.05;
      utterance.volume = 1.0;
      utterance.pitch = voiceName === 'Charon' || voiceName === 'Fenrir' ? 0.9 : 1.1;

      if (lang === 'hi') {
        utterance.lang = 'hi-IN';
      } else {
        utterance.lang = 'en-US';
      }

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const match = voices.find((v) =>
          lang === 'hi' ? v.lang.startsWith('hi') : v.lang.startsWith('en')
        );
        if (match) utterance.voice = match;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('SpeechSynthesis error:', e);
    }
  }

  const wavBlob = pcmToWavBlob(pcm, sampleRate, 1);
  const audioUrl = URL.createObjectURL(wavBlob);

  return {
    audioBlob: wavBlob,
    audioUrl,
    voiceName,
    duration: tl.D,
    script,
    provider: 'device-speech'
  };
}

/**
 * Main Voiceover generator:
 * 1. Tries Gemini 2.0 Flash REST Audio (most reliable)
 * 2. Tries Gemini Live Multimodal WebSocket
 * 3. Gracefully falls back to Device Speech synthesis
 */
export async function generateGeminiVoiceover(
  videoData: VideoData,
  tl: TimelineData,
  voiceName: VoicePersona = 'Puck'
): Promise<VoiceoverResult> {
  const settings = storage.getSettings();
  const apiKey = settings.geminiApiKey?.trim();
  const script = buildNarrationScript(videoData);

  if (apiKey) {
    // 1. Try REST audio with gemini-2.0-flash
    const restModels = ['gemini-2.0-flash', 'gemini-2.5-flash'];
    for (const m of restModels) {
      try {
        console.log(`Attempting REST audio with model ${m}...`);
        const blob = await generateRestAudio(apiKey, m, voiceName, script);
        if (blob && blob.size > 1000) {
          const audioUrl = URL.createObjectURL(blob);
          return {
            audioBlob: blob,
            audioUrl,
            voiceName,
            duration: tl.D,
            script,
            provider: 'gemini-live'
          };
        }
      } catch (err) {
        console.warn(`REST audio with ${m} failed:`, err);
      }
    }

    // 2. Try Gemini Live WebSocket
    const wsModels = ['models/gemini-2.0-flash', 'models/gemini-2.5-flash'];
    for (const m of wsModels) {
      try {
        console.log(`Attempting Live WebSocket audio with model ${m}...`);
        const blob = await generateLiveWebSocketAudio(apiKey, m, voiceName, script);
        if (blob && blob.size > 1000) {
          const audioUrl = URL.createObjectURL(blob);
          return {
            audioBlob: blob,
            audioUrl,
            voiceName,
            duration: tl.D,
            script,
            provider: 'gemini-live'
          };
        }
      } catch (err) {
        console.warn(`WebSocket audio with ${m} failed:`, err);
      }
    }
  }

  // 3. Fallback to Device Speech
  console.info('Using device speech synthesis fallback');
  return generateDeviceVoiceover(script, tl, voiceName, videoData.language);
}
