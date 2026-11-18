export type Language = 'en' | 'hinglish' | 'hi';
export type StampMode = 'en' | 'localized';

export interface RoundData {
  lines: string[];
  fact: boolean;
  proof: string[];
  source?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface VideoData {
  topic?: string;
  language: Language;
  rounds: RoundData[];
  recap: string[];
  voiceoverBlob?: Blob;
  voiceoverUrl?: string;
  voiceoverPersona?: string;
  voiceoverScript?: string;
}

export interface TimelineData {
  D: number;
  title: number;
  rounds: number[];
  guess: number;
  stamp: number;
  proof: number;
  out: number;
  score: number;
  roundDuration: number;
}

export interface EngineSettings {
  stampMode: StampMode;
}
