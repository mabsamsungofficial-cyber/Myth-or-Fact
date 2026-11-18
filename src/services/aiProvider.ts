import type { Language, VideoData } from '../engine/types.ts';
import { storage } from './storage.ts';
import { generateWithGemini } from './geminiClient.ts';

export interface AIProvider {
  generate(topic: string, language: Language, roundsCount: number): Promise<VideoData>;
}

export class DefaultAIProvider implements AIProvider {
  async generate(topic: string, language: Language, roundsCount: number): Promise<VideoData> {
    const settings = storage.getSettings();
    const apiKey = settings.geminiApiKey?.trim();

    if (!apiKey) {
      throw new Error(
        'Gemini API key is required. Tap Settings (gear icon) in the top right to enter your Google Gemini API key.'
      );
    }

    return await generateWithGemini(topic, language, roundsCount);
  }
}

export const aiProvider = new DefaultAIProvider();
