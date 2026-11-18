import type { Language } from '../engine/types.ts';
import { aiProvider } from '../services/aiProvider.ts';
import { storage } from '../services/storage.ts';

export interface HomeState {
  topic: string;
  language: Language;
  roundsCount: number;
  loading: boolean;
  error?: string;
}

export function renderHomeScreen(
  container: HTMLElement,
  onGenerated: (data: any) => void,
  onOpenSettings: () => void
) {
  const currentSettings = storage.getSettings();
  const state: HomeState = {
    topic: '',
    language: currentSettings.defaultLanguage || 'en',
    roundsCount: 4,
    loading: false
  };

  function update() {
    const hasApiKey = Boolean(currentSettings.geminiApiKey?.trim());

    container.innerHTML = `
      <header class="app-header">
        <div class="brand">
          <h1 style="font-size:22px;letter-spacing:-0.01em;">Myth or Fact</h1>
        </div>
        <button id="openSettingsBtn" class="icon-btn" aria-label="Settings">
          ⚙️ Settings
        </button>
      </header>

      <main>
        ${
          !hasApiKey
            ? `<div class="disclaimer-banner" style="background:rgba(255,214,10,0.1);border-color:rgba(255,214,10,0.3);color:var(--ink);">
                <span>🔑</span>
                <span><strong>API Key Required:</strong> Open <strong>Settings</strong> to configure your Google Gemini API key.</span>
               </div>`
            : ''
        }

        <div class="card">
          <h2 class="card-title">New Video</h2>
          
          <div class="field">
            <label for="topicInput">Topic</label>
            <input 
              id="topicInput" 
              class="input" 
              type="text" 
              placeholder="e.g. Sleep, Nutrition, Space, Exercise..."
              value="${escapeHtml(state.topic)}"
              ${state.loading ? 'disabled' : ''}
              autofocus
            />
          </div>

          <div class="field">
            <label>Language</label>
            <div class="chip-group" id="langChips">
              <button type="button" class="chip ${state.language === 'en' ? 'active' : ''}" data-lang="en">
                English
              </button>
              <button type="button" class="chip ${state.language === 'hinglish' ? 'active' : ''}" data-lang="hinglish">
                Hinglish
              </button>
              <button type="button" class="chip ${state.language === 'hi' ? 'active' : ''}" data-lang="hi">
                Hindi
              </button>
            </div>
          </div>

          <div class="field">
            <label>Rounds</label>
            <div class="chip-group" id="roundChips">
              <button type="button" class="chip ${state.roundsCount === 3 ? 'active' : ''}" data-count="3">
                3 Rounds
              </button>
              <button type="button" class="chip ${state.roundsCount === 4 ? 'active' : ''}" data-count="4">
                4 Rounds
              </button>
              <button type="button" class="chip ${state.roundsCount === 5 ? 'active' : ''}" data-count="5">
                5 Rounds
              </button>
            </div>
          </div>

          ${
            state.error
              ? `<div style="background:rgba(224,49,49,0.15);border:1px solid var(--red);color:#ff8787;padding:12px;border-radius:8px;font-size:13px;font-weight:600;margin-bottom:14px;line-height:1.4;">
                  ${escapeHtml(state.error)}
                 </div>`
              : ''
          }

          <button id="generateBtn" class="btn btn-primary" ${state.loading ? 'disabled' : ''}>
            ${
              state.loading
                ? `<span>Creating video...</span>`
                : `<span>Create Video</span>`
            }
          </button>
        </div>
      </main>
    `;

    container.querySelector('#openSettingsBtn')?.addEventListener('click', onOpenSettings);

    const topicInput = container.querySelector('#topicInput') as HTMLInputElement;
    topicInput?.addEventListener('input', (e) => {
      state.topic = (e.target as HTMLInputElement).value;
    });

    container.querySelectorAll('#langChips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.language = btn.getAttribute('data-lang') as Language;
        update();
      });
    });

    container.querySelectorAll('#roundChips .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.roundsCount = parseInt(btn.getAttribute('data-count') || '4', 10);
        update();
      });
    });

    container.querySelector('#generateBtn')?.addEventListener('click', async () => {
      const topic = state.topic.trim();
      if (!topic) {
        state.error = 'Please enter a topic.';
        update();
        return;
      }

      state.loading = true;
      state.error = undefined;
      update();

      try {
        const result = await aiProvider.generate(topic, state.language, state.roundsCount);
        onGenerated(result);
      } catch (err: any) {
        state.loading = false;
        state.error = err?.message || 'Failed to generate video. Please check your API key.';
        update();
      }
    });
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  update();
}
