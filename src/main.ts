import './ui/styles.css';
import type { VideoData } from './engine/types.ts';
import { buildTimeline } from './engine/timeline.ts';
import { storage } from './services/storage.ts';
import { renderHomeScreen } from './ui/homeScreen.ts';
import { renderReviewScreen } from './ui/reviewScreen.ts';
import { renderPreviewScreen } from './ui/previewScreen.ts';
import { renderExportScreen } from './ui/exportScreen.ts';
import { renderSettingsScreen } from './ui/settingsScreen.ts';

type Screen = 'home' | 'review' | 'preview' | 'export' | 'settings';

interface AppState {
  currentScreen: Screen;
  previousScreen: Screen;
  videoData: VideoData | null;
}

const state: AppState = {
  currentScreen: 'home',
  previousScreen: 'home',
  videoData: null
};

const appContainer = document.getElementById('app')!;

// Wait for bundled fonts to load completely before any canvas draws
async function loadBundledFonts(): Promise<void> {
  const testChars = 'AaZz09“मिथतथ्यसचझूठ#?';
  const fontLoads = [
    '400 60px "Archivo Black"',
    '800 52px Inter',
    '700 32px Inter',
    '400 104px Anton',
    '900 160px "Playfair Display"',
    '700 32px "Noto Sans Devanagari"',
    '800 52px "Noto Sans Devanagari"'
  ];

  try {
    await Promise.all(fontLoads.map((f) => document.fonts.load(f, testChars)));
    await document.fonts.ready;
    console.log('✅ All bundled fonts successfully loaded and verified.');
  } catch (err) {
    console.warn('Font preload completed with warning:', err);
  }
}

function navigateTo(screen: Screen) {
  state.previousScreen = state.currentScreen;
  state.currentScreen = screen;
  render();
}

function render() {
  appContainer.innerHTML = '';

  switch (state.currentScreen) {
    case 'home':
      renderHomeScreen(
        appContainer,
        (generatedData: VideoData) => {
          state.videoData = generatedData;
          navigateTo('review');
        },
        () => navigateTo('settings')
      );
      break;

    case 'review':
      if (!state.videoData) {
        navigateTo('home');
        return;
      }
      renderReviewScreen(
        appContainer,
        state.videoData,
        (approvedData: VideoData) => {
          state.videoData = approvedData;
          navigateTo('preview');
        },
        () => navigateTo('home')
      );
      break;

    case 'preview':
      if (!state.videoData) {
        navigateTo('home');
        return;
      }
      renderPreviewScreen(
        appContainer,
        state.videoData,
        () => navigateTo('review'),
        () => navigateTo('export')
      );
      break;

    case 'export':
      if (!state.videoData) {
        navigateTo('home');
        return;
      }
      {
        const currentSettings = storage.getSettings();
        const tl = buildTimeline(state.videoData);
        renderExportScreen(
          appContainer,
          state.videoData,
          tl,
          { stampMode: currentSettings.stampMode },
          () => navigateTo('preview'),
          () => navigateTo('home')
        );
      }
      break;

    case 'settings':
      renderSettingsScreen(appContainer, () => {
        navigateTo(state.previousScreen === 'settings' ? 'home' : state.previousScreen);
      });
      break;
  }
}

// Bootstrap
(async () => {
  await storage.init();
  await loadBundledFonts();
  render();
})();
