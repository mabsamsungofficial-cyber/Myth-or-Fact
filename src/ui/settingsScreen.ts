import type { Language, StampMode } from '../engine/types.ts';
import { storage, type ModelOption } from '../services/storage.ts';
import { testGeminiApiKey, cleanModelName } from '../services/geminiClient.ts';

export function renderSettingsScreen(container: HTMLElement, onBack: () => void) {
  const currentSettings = storage.getSettings();
  let showKey = false;
  let isTesting = false;
  let testStatus: { type: 'success' | 'error'; message: string } | null = null;
  let modelsList: ModelOption[] = currentSettings.availableModels && currentSettings.availableModels.length > 0
    ? currentSettings.availableModels
    : [
        { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (Recommended)' },
        { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
        { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
        { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
      ];

  function update() {
    const selectedModel = cleanModelName(currentSettings.geminiModel || 'gemini-2.5-flash');

    container.innerHTML = `
      <header class="app-header">
        <div class="brand">
          <button id="backBtn" class="icon-btn" aria-label="Go back">← Back</button>
          <h1 style="font-size:18px;">Settings</h1>
        </div>
      </header>

      <main>
        <div class="card">
          <h2 class="card-title">Google Gemini API</h2>
          
          <div class="field">
            <label for="apiKeyInput">API Key</label>
            <div style="display:flex;gap:8px;">
              <input 
                id="apiKeyInput" 
                class="input" 
                type="${showKey ? 'text' : 'password'}" 
                placeholder="AIzaSy..." 
                value="${escapeHtml(currentSettings.geminiApiKey || '')}" 
                style="flex:1;"
                autocomplete="off"
                spellcheck="false"
              />
              <button id="toggleShowKeyBtn" type="button" class="icon-btn" style="padding:0 12px;font-size:12px;">
                ${showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
              <button id="testKeyBtn" type="button" class="btn btn-secondary" style="font-size:12px;padding:6px 14px;" ${isTesting ? 'disabled' : ''}>
                ${isTesting ? 'Testing connection...' : 'Test Connection'}
              </button>
              <div style="font-size:11px;color:var(--dim);">Stored locally on device</div>
            </div>

            ${
              testStatus
                ? `<div style="margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.4;background:${
                    testStatus.type === 'success' ? 'rgba(47,158,68,0.15)' : 'rgba(224,49,49,0.15)'
                  };border:1px solid ${
                    testStatus.type === 'success' ? 'rgba(47,158,68,0.4)' : 'rgba(224,49,49,0.4)'
                  };color:${testStatus.type === 'success' ? '#69db7c' : '#ff8787'};">
                    ${escapeHtml(testStatus.message)}
                   </div>`
                : ''
            }
          </div>

          <div class="field" style="margin-bottom:4px;">
            <label for="modelSelect">AI Model</label>
            <select id="modelSelect" class="select">
              ${modelsList
                .map(
                  (m) =>
                    `<option value="${m.id}" ${m.id === selectedModel ? 'selected' : ''}>
                      ${escapeHtml(m.displayName)}
                    </option>`
                )
                .join('')}
            </select>
          </div>
        </div>

        <div class="card">
          <h2 class="card-title">Video Preferences</h2>

          <div class="field">
            <label for="defaultLangSelect">Default Language</label>
            <select id="defaultLangSelect" class="select">
              <option value="en" ${currentSettings.defaultLanguage === 'en' ? 'selected' : ''}>
                English
              </option>
              <option value="hinglish" ${currentSettings.defaultLanguage === 'hinglish' ? 'selected' : ''}>
                Hinglish (Latin alphabet)
              </option>
              <option value="hi" ${currentSettings.defaultLanguage === 'hi' ? 'selected' : ''}>
                Hindi (हिंदी - Devanagari)
              </option>
            </select>
          </div>

          <div class="field" style="margin-bottom:4px;">
            <label for="stampModeSelect">Stamp Style</label>
            <select id="stampModeSelect" class="select">
              <option value="en" ${currentSettings.stampMode === 'en' ? 'selected' : ''}>
                English (MYTH / FACT)
              </option>
              <option value="localized" ${currentSettings.stampMode === 'localized' ? 'selected' : ''}>
                Localized (झूठ / सच)
              </option>
            </select>
          </div>
        </div>

        <div id="saveToast" style="display:none;" class="toast">
          Settings saved successfully
        </div>

        <button id="saveBtn" class="btn btn-primary" style="margin-top:10px;">
          Save Settings
        </button>
      </main>
    `;

    const backBtn = container.querySelector('#backBtn') as HTMLButtonElement;
    const saveBtn = container.querySelector('#saveBtn') as HTMLButtonElement;
    const testKeyBtn = container.querySelector('#testKeyBtn') as HTMLButtonElement;
    const apiKeyInput = container.querySelector('#apiKeyInput') as HTMLInputElement;
    const modelSelect = container.querySelector('#modelSelect') as HTMLSelectElement;
    const defaultLangSelect = container.querySelector('#defaultLangSelect') as HTMLSelectElement;
    const stampModeSelect = container.querySelector('#stampModeSelect') as HTMLSelectElement;
    const toggleShowKeyBtn = container.querySelector('#toggleShowKeyBtn') as HTMLButtonElement;
    const saveToast = container.querySelector('#saveToast') as HTMLElement;

    backBtn?.addEventListener('click', onBack);

    toggleShowKeyBtn?.addEventListener('click', () => {
      showKey = !showKey;
      currentSettings.geminiApiKey = apiKeyInput.value;
      update();
    });

    testKeyBtn?.addEventListener('click', async () => {
      const enteredKey = apiKeyInput.value.trim();
      if (!enteredKey) {
        testStatus = { type: 'error', message: 'Please enter an API key to test.' };
        update();
        return;
      }

      isTesting = true;
      testStatus = null;
      update();

      const result = await testGeminiApiKey(enteredKey);
      isTesting = false;

      if (result.ok && result.models && result.models.length > 0) {
        modelsList = result.models;
        currentSettings.availableModels = result.models;
        // If current selection is not in list, select first flash model or first available
        const hasCurrent = modelsList.some((m) => m.id === currentSettings.geminiModel);
        if (!hasCurrent) {
          const preferred = modelsList.find((m) => m.id.includes('flash')) || modelsList[0];
          currentSettings.geminiModel = preferred.id;
        }
        testStatus = {
          type: 'success',
          message: `Connection successful. Detected ${result.models.length} active models.`
        };
      } else {
        testStatus = {
          type: 'error',
          message: result.error || 'Connection failed. Please verify your API key.'
        };
      }
      update();
    });

    saveBtn?.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const chosenModel = modelSelect ? cleanModelName(modelSelect.value) : 'gemini-2.5-flash';

      await storage.saveSettings({
        geminiApiKey: apiKeyInput.value.trim(),
        geminiModel: chosenModel,
        defaultLanguage: defaultLangSelect.value as Language,
        stampMode: stampModeSelect.value as StampMode,
        availableModels: modelsList
      });

      saveToast.style.display = 'block';
      setTimeout(() => {
        saveToast.style.display = 'none';
        onBack();
      }, 600);
    });
  }

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  update();
}
