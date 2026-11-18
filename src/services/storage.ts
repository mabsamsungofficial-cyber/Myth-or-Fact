import type { Language, StampMode } from '../engine/types.ts';
import { Preferences } from '@capacitor/preferences';

export interface ModelOption {
  id: string;
  displayName: string;
}

export interface AppSettings {
  geminiApiKey: string;
  geminiModel: string;
  defaultLanguage: Language;
  stampMode: StampMode;
  availableModels?: ModelOption[];
}

const SETTINGS_KEY = 'myth_or_fact_settings_v3';
const API_KEY_SECURE_KEY = 'myth_or_fact_gemini_key_v3';

export const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  defaultLanguage: 'en',
  stampMode: 'en',
  availableModels: [
    { id: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (Recommended)' },
    { id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
    { id: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
    { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
  ]
};

let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let initialized = false;

function readLocalBackup(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const key = localStorage.getItem(API_KEY_SECURE_KEY) || sessionStorage.getItem(API_KEY_SECURE_KEY) || '';
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      geminiApiKey: key || parsed.geminiApiKey || ''
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// Initial sync load
cachedSettings = readLocalBackup();

export const storage = {
  async init(): Promise<AppSettings> {
    try {
      const { value: settingsVal } = await Preferences.get({ key: SETTINGS_KEY });
      const { value: secureKey } = await Preferences.get({ key: API_KEY_SECURE_KEY });

      const parsed = settingsVal ? JSON.parse(settingsVal) : {};
      const local = readLocalBackup();

      cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...local,
        ...parsed,
        geminiApiKey: secureKey || local.geminiApiKey || parsed.geminiApiKey || ''
      };

      if (cachedSettings.geminiApiKey) {
        localStorage.setItem(API_KEY_SECURE_KEY, cachedSettings.geminiApiKey);
      }
    } catch {
      cachedSettings = readLocalBackup();
    }
    initialized = true;
    return cachedSettings;
  },

  getSettings(): AppSettings {
    if (!initialized) {
      cachedSettings = readLocalBackup();
    }
    return cachedSettings;
  },

  async saveSettings(settings: AppSettings): Promise<void> {
    cachedSettings = { ...settings };

    try {
      if (settings.geminiApiKey) {
        await Preferences.set({ key: API_KEY_SECURE_KEY, value: settings.geminiApiKey });
        localStorage.setItem(API_KEY_SECURE_KEY, settings.geminiApiKey);
        sessionStorage.setItem(API_KEY_SECURE_KEY, settings.geminiApiKey);
      } else {
        await Preferences.remove({ key: API_KEY_SECURE_KEY });
        localStorage.removeItem(API_KEY_SECURE_KEY);
        sessionStorage.removeItem(API_KEY_SECURE_KEY);
      }

      const toSave = { ...settings, geminiApiKey: '' };
      await Preferences.set({ key: SETTINGS_KEY, value: JSON.stringify(toSave) });
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('Error saving settings', e);
      if (settings.geminiApiKey) {
        localStorage.setItem(API_KEY_SECURE_KEY, settings.geminiApiKey);
      }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, geminiApiKey: '' }));
    }
  }
};
