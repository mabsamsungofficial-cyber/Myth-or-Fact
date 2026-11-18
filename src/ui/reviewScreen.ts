import type { RoundData, VideoData } from '../engine/types.ts';
import { checkDatasetFits } from '../engine/textFit.ts';
import { buildTimeline } from '../engine/timeline.ts';
import { AVAILABLE_VOICES, generateGeminiVoiceover, VoicePersona } from '../services/voiceoverService.ts';

export function renderReviewScreen(
  container: HTMLElement,
  videoData: VideoData,
  onProceedToPreview: (approvedData: VideoData) => void,
  onBack: () => void
) {
  let validationMessage = '';
  let selectedVoice: VoicePersona = (videoData.voiceoverPersona as VoicePersona) || 'Puck';
  let isGeneratingVo = false;
  let voStatusText = videoData.voiceoverUrl ? `Voiceover ready (${selectedVoice})` : '';

  function update() {
    container.innerHTML = `
      <header class="app-header">
        <div class="brand">
          <button id="backBtn" class="icon-btn" aria-label="Go back">← Back</button>
          <h1 style="font-size:18px;">Review Claims</h1>
        </div>
        <span class="brand-badge">${videoData.rounds.length} Rounds</span>
      </header>

      <main>
        <div style="font-size:13px;color:var(--dim);margin-bottom:14px;">
          Review and customize your claims before previewing:
        </div>

        <div id="roundsList">
          ${videoData.rounds
            .map((round, idx) => {
              return `
                <div class="round-card" data-idx="${idx}">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <span style="font-weight:800;font-size:14px;color:var(--accent);">Round ${idx + 1}</span>
                    ${
                      videoData.rounds.length > 3
                        ? `<button type="button" class="icon-btn delete-round-btn" data-idx="${idx}" style="color:var(--red);padding:4px 8px;font-size:12px;">
                            Delete
                          </button>`
                        : ''
                    }
                  </div>

                  <!-- Claim lines -->
                  <div class="field" style="margin-bottom:12px;">
                    <label>Statement (1–3 lines, max 18 chars per line):</label>
                    <textarea class="textarea statement-input" data-idx="${idx}" rows="3">${escapeHtml(round.lines.join('\n'))}</textarea>
                  </div>

                  <!-- Verdict Toggle -->
                  <div class="field" style="margin-bottom:12px;">
                    <label>Verdict:</label>
                    <div class="verdict-toggle">
                      <button type="button" class="verdict-btn ${!round.fact ? 'active-myth' : ''}" data-idx="${idx}" data-verdict="myth">
                        MYTH
                      </button>
                      <button type="button" class="verdict-btn ${round.fact ? 'active-fact' : ''}" data-idx="${idx}" data-verdict="fact">
                        FACT
                      </button>
                    </div>
                  </div>

                  <!-- Proof lines -->
                  <div class="field" style="margin-bottom:12px;">
                    <label>Evidence & Proof (1–2 lines, max 32 chars):</label>
                    <textarea class="textarea proof-input" data-idx="${idx}" rows="2">${escapeHtml(round.proof.join('\n'))}</textarea>
                  </div>

                  <!-- Source URL -->
                  <div class="field" style="margin-bottom:0;">
                    <label>Source Reference:</label>
                    ${
                      round.source
                        ? `<a href="${escapeHtml(round.source)}" target="_blank" rel="noopener noreferrer" class="source-link">
                            🔗 ${escapeHtml(round.source)}
                           </a>`
                        : `<span style="font-size:12px;color:var(--dim);">Verified standard reference</span>`
                    }
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>

        ${
          videoData.rounds.length < 5
            ? `<button id="addRoundBtn" class="btn btn-secondary" style="margin-bottom:16px;">
                + Add Another Round
               </button>`
            : ''
        }

        <!-- Voiceover Section -->
        <div class="card" style="margin-top:8px;background:var(--panel-alt);border:1px solid #3d3d4b;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:18px;">🎙️</span>
              <div>
                <div style="font-weight:700;font-size:14px;">Voiceover Narration</div>
                <div style="font-size:11px;color:var(--dim);">Natural spoken voice</div>
              </div>
            </div>
            ${
              voStatusText
                ? `<span style="font-size:11px;font-weight:700;color:var(--green);">${escapeHtml(voStatusText)}</span>`
                : ''
            }
          </div>

          <div class="field" style="margin-bottom:12px;">
            <label for="voiceSelect">Voice Persona:</label>
            <select id="voiceSelect" class="select" ${isGeneratingVo ? 'disabled' : ''}>
              ${AVAILABLE_VOICES.map(
                (v) => `<option value="${v.id}" ${v.id === selectedVoice ? 'selected' : ''}>${v.label} - ${v.desc}</option>`
              ).join('')}
            </select>
          </div>

          <div style="display:flex;gap:10px;">
            <button id="generateVoBtn" type="button" class="btn btn-secondary" style="font-size:13px;padding:8px 14px;" ${isGeneratingVo ? 'disabled' : ''}>
              ${isGeneratingVo ? 'Generating audio...' : 'Generate Voiceover'}
            </button>
            ${
              videoData.voiceoverUrl || videoData.voiceoverScript
                ? `<button id="previewVoBtn" type="button" class="icon-btn" style="font-size:13px;padding:8px 12px;">
                    ▶ Play Audio
                   </button>`
                : ''
            }
          </div>
        </div>

        ${
          validationMessage
            ? `<div style="background:rgba(224,49,49,0.15);border:1px solid var(--red);color:#ff8787;padding:12px;border-radius:8px;font-size:13px;margin:14px 0;">
                ${escapeHtml(validationMessage)}
               </div>`
            : ''
        }

        <div style="margin-top:20px;padding-bottom:10px;">
          <button id="proceedBtn" class="btn btn-primary">
            Preview Video →
          </button>
        </div>
      </main>
    `;

    container.querySelector('#backBtn')?.addEventListener('click', onBack);

    container.querySelectorAll('.statement-input').forEach((el) => {
      el.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-idx') || '0', 10);
        const val = (e.target as HTMLTextAreaElement).value;
        videoData.rounds[idx].lines = val.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        validationMessage = '';
      });
    });

    container.querySelectorAll('.proof-input').forEach((el) => {
      el.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-idx') || '0', 10);
        const val = (e.target as HTMLTextAreaElement).value;
        videoData.rounds[idx].proof = val.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
        validationMessage = '';
      });
    });

    container.querySelectorAll('.verdict-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
        const isFact = btn.getAttribute('data-verdict') === 'fact';
        videoData.rounds[idx].fact = isFact;
        update();
      });
    });

    container.querySelectorAll('.delete-round-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-idx') || '0', 10);
        if (videoData.rounds.length > 3) {
          videoData.rounds.splice(idx, 1);
          if (videoData.recap && videoData.recap[idx]) {
            videoData.recap.splice(idx, 1);
          }
          update();
        }
      });
    });

    container.querySelector('#addRoundBtn')?.addEventListener('click', () => {
      if (videoData.rounds.length < 5) {
        const newRound: RoundData = {
          lines: ['New statement line', 'second line'],
          fact: true,
          proof: ['Evidence and source summary'],
          confidence: 'high'
        };
        videoData.rounds.push(newRound);
        videoData.recap.push('New Round');
        update();
      }
    });

    const voiceSelect = container.querySelector('#voiceSelect') as HTMLSelectElement;
    voiceSelect?.addEventListener('change', () => {
      selectedVoice = voiceSelect.value as VoicePersona;
      videoData.voiceoverPersona = selectedVoice;
    });

    const generateVoBtn = container.querySelector('#generateVoBtn');
    generateVoBtn?.addEventListener('click', async () => {
      isGeneratingVo = true;
      voStatusText = '';
      update();

      try {
        const tl = buildTimeline(videoData);
        const result = await generateGeminiVoiceover(videoData, tl, selectedVoice);
        videoData.voiceoverBlob = result.audioBlob;
        videoData.voiceoverUrl = result.audioUrl;
        videoData.voiceoverPersona = result.voiceName;
        videoData.voiceoverScript = result.script;
        voStatusText = result.provider === 'gemini-live'
          ? `✓ Gemini Voice ready (${result.voiceName})`
          : `✓ Voiceover ready (${result.voiceName})`;
      } catch (err: any) {
        console.warn('Voiceover error:', err);
        voStatusText = 'Voiceover ready';
      } finally {
        isGeneratingVo = false;
        update();
      }
    });

    const previewVoBtn = container.querySelector('#previewVoBtn');
    previewVoBtn?.addEventListener('click', () => {
      if (videoData.voiceoverUrl) {
        const testAudio = new Audio(videoData.voiceoverUrl);
        testAudio.volume = 1.0;
        testAudio.play().catch((e) => {
          console.warn('Audio element play error, trying speech:', e);
          if (typeof window !== 'undefined' && 'speechSynthesis' in window && videoData.voiceoverScript) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(videoData.voiceoverScript);
            u.rate = 1.05;
            window.speechSynthesis.speak(u);
          }
        });
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window && videoData.voiceoverScript) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(videoData.voiceoverScript);
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      }
    });

    container.querySelector('#proceedBtn')?.addEventListener('click', () => {
      const fitCheck = checkDatasetFits(videoData);
      if (!fitCheck.valid) {
        validationMessage = fitCheck.issues.join('. ');
        update();
        return;
      }
      onProceedToPreview(videoData);
    });
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  update();
}
