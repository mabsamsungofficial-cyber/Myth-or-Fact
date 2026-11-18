import type { EngineSettings, TimelineData, VideoData } from './types.ts';
import { fitProofLines, fitStampText, fitStatementLines, getFontFamily } from './textFit.ts';

const W = 720;
const H = 1280;
const TAU = Math.PI * 2;

// Math helpers
const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const span = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));

const hash = (s: string | number): number => {
  s = String(s);
  let h = 0x9e3779b1;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
};

const rng = (seed: string | number) => {
  const s = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  let a = (s ^ 0xa5a5a5a5) >>> 0;
  let b = (Math.imul(s, 0x27d4eb2d) >>> 0) || 1;
  let c = (0x165667b1 ^ s) >>> 0;
  let d = (rotl(s, 7) >>> 0) || 7;

  const r = () => {
    const res = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return res / 4294967296;
  };
  for (let i = 0; i < 8; i++) r();
  return r;
};

const ez = {
  outExpo: (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  back: (u: number, s = 1.7) =>
    u <= 0 ? 0 : u >= 1 ? 1 : 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2)
};

const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
};

interface TxtOpts {
  f?: string;
  a?: CanvasTextAlign;
  b?: CanvasTextBaseline;
  ls?: number;
  s?: number;
  alpha?: number;
  c?: string;
}

function textW(c: CanvasRenderingContext2D, s: string, font: string, ls = 0): number {
  c.save();
  c.font = font;
  if ('letterSpacing' in c && ls) {
    // @ts-ignore
    c.letterSpacing = `${ls}px`;
  }
  const w = c.measureText(s).width;
  c.restore();
  return w;
}

function txt(c: CanvasRenderingContext2D, s: string, x: number, y: number, o: TxtOpts = {}) {
  c.save();
  c.font = o.f || '700 40px Inter';
  c.textAlign = o.a || 'left';
  c.textBaseline = o.b || 'alphabetic';
  if ('letterSpacing' in c && o.ls != null) {
    // @ts-ignore
    c.letterSpacing = `${o.ls}px`;
  }
  c.translate(x, y);
  if (o.s != null) c.scale(o.s, o.s);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  c.fillStyle = o.c || '#fff';
  c.fillText(s, 0, 0);
  c.restore();
}

const pop = (t: number, t0: number, d = 0.45, s = 1.9) => ez.back(span(t, t0, t0 + d), s);
const inn = (t: number, t0: number, d = 0.5) => ez.outExpo(span(t, t0, t0 + d));

function shake(c: CanvasRenderingContext2D, t: number, hits: number[], amp = 14, d = 0.35) {
  let dx = 0;
  let dy = 0;
  for (const h of hits) {
    const u = (t - h) / d;
    if (u > 0 && u < 1) {
      const k = (1 - u) * amp;
      dx += Math.sin(u * 61) * k;
      dy += Math.cos(u * 47) * k;
    }
  }
  c.translate(dx, dy);
}

// Color Palette
export const COLORS = {
  bg: '#eef1f4',
  ink: '#111111',
  red: '#e03131',
  green: '#2f9e44',
  yellow: '#f5b700',
  mute: '#5a6270',
  border: '#dde2e8'
};

// Offscreen Stamp Cache
const STAMP_LAYERS: Record<string, HTMLCanvasElement> = {};

function getStampLayer(word: string, col: string, fontStr: string): HTMLCanvasElement {
  const cacheKey = `${word}_${col}_${fontStr}`;
  if (STAMP_LAYERS[cacheKey]) return STAMP_LAYERS[cacheKey];

  const L = document.createElement('canvas');
  L.width = 340;
  L.height = 180;
  const x = L.getContext('2d')!;

  x.translate(170, 90);
  x.strokeStyle = col;
  x.lineWidth = 9;
  rr(x, -150, -70, 300, 140, 16);
  x.stroke();

  x.lineWidth = 3;
  rr(x, -134, -54, 268, 108, 10);
  x.stroke();

  txt(x, word, 0, 36, { f: fontStr, c: col, a: 'center', ls: 4 });

  // Knockout specks revealing the background card
  x.globalCompositeOperation = 'destination-out';
  const r = rng(`stamp_${word}`);
  for (let i = 0; i < 220; i++) {
    x.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
    x.beginPath();
    x.arc((r() - 0.5) * 300, (r() - 0.5) * 140, r() * 3.4, 0, TAU);
    x.fill();
  }

  return (STAMP_LAYERS[cacheKey] = L);
}

function drawStamp(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  word: string,
  col: string,
  fontStr: string,
  p: number
) {
  if (p <= 0) return;
  c.save();
  c.translate(x, y);
  c.rotate(-0.2);
  const s = lerp(2.2, 1, Math.min(1, p));
  c.scale(s, s);
  c.globalAlpha *= Math.min(1, p * 2);
  c.drawImage(getStampLayer(word, col, fontStr), -170, -90);
  c.restore();
}

/**
 * Render single round card and elements
 */
function renderRound(
  c: CanvasRenderingContext2D,
  lt: number,
  index: number,
  data: VideoData,
  tl: TimelineData,
  settings: EngineSettings
) {
  const round = data.rounds[index];
  if (!round) return;

  const isFact = round.fact;
  const p = pop(lt, 0, 0.45, 2);
  if (p <= 0) return;

  // 1. White Statement Card
  c.save();
  c.translate(360, 470);
  c.scale(p, p);
  c.shadowColor = 'rgba(0,0,0,0.12)';
  c.shadowBlur = 36;
  c.shadowOffsetY = 14;
  rr(c, -320, -200, 640, 400, 30);
  c.fillStyle = '#fff';
  c.fill();
  c.shadowColor = 'transparent';

  // Decorative Quote Mark
  txt(c, '“', -290, -60, { f: '900 160px "Playfair Display", Georgia', c: '#e5e8ec' });

  // Round Number Counter
  const counterFont = `700 24px ${getFontFamily(data.language, 'body')}`;
  txt(c, `#${index + 1}`, 290, -150, { f: counterFont, c: '#9aa3ad', a: 'right' });

  // Fit & Render Statement Lines
  const statementFit = fitStatementLines(round.lines, data.language, 540, 52, 46);
  const startY = -50 - Math.min(30, (statementFit.lines.length - 3) * 20);

  statementFit.lines.forEach((l, k) => {
    txt(c, l, -270, startY + k * statementFit.lineHeight, {
      f: statementFit.font,
      c: COLORS.ink
    });
  });
  c.restore();

  // 2. Guess Bar
  const g = span(lt, tl.guess, tl.stamp - 0.1);
  if (g > 0 && lt < tl.stamp) {
    let guessText = 'MYTH YA FACT? GUESS KARO';
    if (data.language === 'en') guessText = 'MYTH OR FACT? GUESS NOW';
    else if (data.language === 'hi') guessText = 'मिथ या तथ्य? अनुमान लगाएं';

    const guessFont = `800 26px ${getFontFamily(data.language, 'body')}`;
    txt(c, guessText, 360, 760, { f: guessFont, c: COLORS.mute, a: 'center', ls: 2 });

    rr(c, 160, 784, 400, 14, 7);
    c.fillStyle = COLORS.border;
    c.fill();

    rr(c, 160, 784, 400 * g, 14, 7);
    c.fillStyle = COLORS.yellow;
    c.fill();
  }

  // 3. Distressed Stamp Slam
  let stampWord = isFact ? 'FACT' : 'MYTH';
  if (settings.stampMode === 'localized' && data.language === 'hi') {
    stampWord = isFact ? 'सच' : 'झूठ';
  }
  const stampCol = isFact ? COLORS.green : COLORS.red;
  const stampFit = fitStampText(stampWord, data.language, 250, 104, 100);

  c.save();
  shake(c, lt, [tl.stamp + 0.15], 14, 0.3);
  drawStamp(
    c,
    460,
    640,
    stampWord,
    stampCol,
    stampFit.font,
    ez.back(span(lt, tl.stamp, tl.stamp + 0.25), 2.2)
  );
  c.restore();

  // 4. Proof Explanation Reveal
  const q = inn(lt, tl.proof, 0.4);
  if (q > 0) {
    c.save();
    c.globalAlpha *= q;

    // Badge circle
    c.fillStyle = isFact ? COLORS.green : COLORS.red;
    c.beginPath();
    c.arc(70, 930, 26, 0, TAU);
    c.fill();

    // Check or Cross symbol
    c.strokeStyle = '#fff';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    if (isFact) {
      c.moveTo(58, 930);
      c.lineTo(67, 940);
      c.lineTo(84, 920);
    } else {
      c.moveTo(60, 920);
      c.lineTo(80, 940);
      c.moveTo(80, 920);
      c.lineTo(60, 940);
    }
    c.stroke();

    // Proof lines
    const proofFit = fitProofLines(round.proof, data.language, 560, 32, 30);
    proofFit.lines.forEach((l, k) => {
      txt(c, l, 112, 942 + k * proofFit.lineHeight, {
        f: proofFit.font,
        c: '#222222'
      });
    });
    c.restore();
  }
}

/**
 * Render recap and final scorecard
 */
function renderScore(
  c: CanvasRenderingContext2D,
  t: number,
  data: VideoData,
  tl: TimelineData,
  settings: EngineSettings
) {
  const roundCount = data.rounds.length;
  // Calculate vertical layout based on number of rounds (3 to 5)
  const itemHeight = roundCount > 4 ? 100 : 120;
  const itemSpacing = roundCount > 4 ? 120 : 150;
  const startY = roundCount > 4 ? 220 : 250;

  data.rounds.forEach((round, k) => {
    const recapLabel = data.recap[k] || round.lines[0] || `Claim #${k + 1}`;
    const u = inn(t, tl.score + k * 0.12, 0.4);
    if (u <= 0) return;

    const y = startY + k * itemSpacing;
    const isFact = round.fact;

    c.save();
    c.globalAlpha = u;
    c.translate(0, (1 - u) * 70);

    c.save();
    c.shadowColor = 'rgba(0,0,0,.12)';
    c.shadowBlur = 30;
    c.shadowOffsetY = 10;
    rr(c, 40, y, 640, itemHeight, 26);
    c.fillStyle = '#fff';
    c.fill();
    c.restore();

    // Recap line text
    const labelFont = `800 ${roundCount > 4 ? 28 : 32}px ${getFontFamily(data.language, 'body')}`;
    txt(c, recapLabel, 72, y + (itemHeight / 2) + 12, {
      f: labelFont,
      c: COLORS.ink
    });

    // Verdict tag
    let badgeText = isFact ? 'FACT' : 'MYTH';
    if (settings.stampMode === 'localized' && data.language === 'hi') {
      badgeText = isFact ? 'सच' : 'झूठ';
    }
    const badgeW = roundCount > 4 ? 120 : 132;
    const badgeH = roundCount > 4 ? 58 : 68;
    const badgeX = 520;
    const badgeY = y + (itemHeight - badgeH) / 2;

    rr(c, badgeX, badgeY, badgeW, badgeH, 14);
    c.fillStyle = isFact ? COLORS.green : COLORS.red;
    c.fill();

    const antFont = `400 ${roundCount > 4 ? 38 : 44}px ${getFontFamily(data.language, 'anton')}`;
    txt(c, badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 14, {
      f: antFont,
      c: '#fff',
      a: 'center',
      ls: 2
    });
    c.restore();
  });

  // Call-to-action scorecard box at bottom
  const scoreCardY = Math.max(880, startY + roundCount * itemSpacing + 20);
  const q = pop(t, tl.score + 0.6, 0.4, 1.8);
  if (q <= 0) return;

  c.save();
  c.translate(360, scoreCardY + 75);
  c.scale(q, q);
  c.translate(-360, -(scoreCardY + 75));

  rr(c, 40, scoreCardY, 640, 140, 28);
  c.fillStyle = COLORS.ink;
  c.fill();

  let textA = 'Kitne sahi ';
  let textB = 'bataye?';
  if (data.language === 'en') {
    textA = 'How many did you ';
    textB = 'get right?';
  } else if (data.language === 'hi') {
    textA = 'कितने सही ';
    textB = 'बताए?';
  }

  const scoreFont = `800 44px ${getFontFamily(data.language, 'body')}`;
  const totalW = textW(c, textA + textB, scoreFont);
  const x0 = 360 - totalW / 2;
  const baselineY = scoreCardY + 86;

  txt(c, textA, x0, baselineY, { f: scoreFont, c: '#fff' });
  txt(c, textB, x0 + textW(c, textA, scoreFont), baselineY, { f: scoreFont, c: COLORS.yellow });
  c.restore();
}

/**
 * Main Pure Frame Renderer: renderFrame(ctx, t, data, settings)
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  t: number,
  data: VideoData,
  tl: TimelineData,
  settings: EngineSettings = { stampMode: 'en' }
) {
  // Clear & set background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Title band at top
  const p = inn(t, tl.title, 0.4);
  const titleHeadFont = '400 60px "Archivo Black", Impact, sans-serif';
  const titleMain = 'MYTH OR FACT';
  txt(ctx, titleMain, 44, 140, { f: titleHeadFont, c: COLORS.ink, alpha: p });
  txt(ctx, '?', 44 + textW(ctx, titleMain, titleHeadFont) + 6, 140, {
    f: titleHeadFont,
    c: COLORS.yellow,
    alpha: p
  });

  // Render active round
  tl.rounds.forEach((t0, i) => {
    const lt = t - t0;
    if (lt < 0 || lt > tl.out + 0.35) return;
    ctx.save();
    ctx.globalAlpha = 1 - span(lt, tl.out, tl.out + 0.3);
    renderRound(ctx, lt, i, data, tl, settings);
    ctx.restore();
  });

  // Round progression indicators
  const cur = tl.rounds.filter((x) => t >= x).length - 1;
  const roundCount = data.rounds.length;

  if (cur >= 0 && t < tl.score) {
    let counterText = `SAWAAL ${cur + 1} / ${roundCount}`;
    if (data.language === 'en') counterText = `ROUND ${cur + 1} / ${roundCount}`;
    else if (data.language === 'hi') counterText = `सवाल ${cur + 1} / ${roundCount}`;

    const counterFont = `800 24px ${getFontFamily(data.language, 'body')}`;
    txt(ctx, counterText, 360, 1130, {
      f: counterFont,
      c: COLORS.mute,
      a: 'center',
      ls: 3
    });

    for (let k = 0; k < roundCount; k++) {
      ctx.fillStyle = k === cur ? COLORS.yellow : k < cur ? COLORS.ink : COLORS.border;
      ctx.beginPath();
      const dotX = 360 + (k - (roundCount - 1) / 2) * 44;
      ctx.arc(dotX, 1172, 13, 0, TAU);
      ctx.fill();
    }
  }

  // Score Screen
  if (t >= tl.score) {
    renderScore(ctx, t, data, tl, settings);
  }
}
