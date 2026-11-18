import type { TimelineData, VideoData } from './types.ts';

export function buildTimeline(data: VideoData): TimelineData {
  const roundCount = Math.max(1, data.rounds.length);
  const roundDuration = 5.8;
  const titleTime = 0.2; // title starts rising at 0.2s, rounds begin at 0.8s
  const firstRoundStart = 0.8;
  
  const rounds: number[] = [];
  for (let i = 0; i < roundCount; i++) {
    rounds.push(Number((firstRoundStart + i * roundDuration).toFixed(3)));
  }

  const scoreStart = Number((firstRoundStart + roundCount * roundDuration).toFixed(3));
  const scoreDuration = 3.0;
  const totalDuration = Number((scoreStart + scoreDuration).toFixed(3));

  return {
    D: totalDuration,
    title: titleTime,
    rounds,
    guess: 1.0,
    stamp: 3.3,
    proof: 3.9,
    out: 5.4,
    score: scoreStart,
    roundDuration
  };
}
