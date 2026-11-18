import type { VideoData } from './types.ts';

// Offscreen canvas for measuring text in headless/node or browser environments
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function getContext(): CanvasRenderingContext2D {
  if (!measureCtx) {
    if (typeof document !== 'undefined') {
      measureCanvas = document.createElement('canvas');
      measureCanvas.width = 1000;
      measureCanvas.height = 1000;
      measureCtx = measureCanvas.getContext('2d')!;
    } else {
      // Node / test environment fallback measurement
      measureCtx = {
        save: () => {},
        restore: () => {},
        font: '',
        measureText: (text: string) => {
          // Approx width based on font size in font string
          const match = /(\d+)px/.exec(measureCtx?.font || '');
          const px = match ? parseInt(match[1], 10) : 40;
          return { width: text.length * (px * 0.58) };
        }
      } as any;
    }
  }
  return measureCtx!;
}

export function measureTextWidth(text: string, font: string, letterSpacing = 0): number {
  const ctx = getContext();
  ctx.save();
  ctx.font = font;
  if ('letterSpacing' in ctx && letterSpacing) {
    // @ts-ignore
    ctx.letterSpacing = `${letterSpacing}px`;
  }
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

export interface FittedText {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  font: string;
  fits: boolean;
}

export function getFontFamily(language: string, variant: 'head' | 'body' | 'anton' = 'body'): string {
  if (language === 'hi') {
    if (variant === 'anton') {
      return '"Noto Sans Devanagari", Impact, sans-serif';
    }
    return '"Noto Sans Devanagari", Inter, system-ui, sans-serif';
  }
  if (variant === 'anton') return 'Anton, Impact, sans-serif';
  if (variant === 'head') return '"Archivo Black", Impact, sans-serif';
  return 'Inter, system-ui, sans-serif';
}

/**
 * Fits statement lines inside the card (inner width 540px).
 * Minimum font size: 46px.
 */
export function fitStatementLines(
  rawLines: string[],
  language: string,
  maxWidth = 540,
  defaultSize = 52,
  minSize = 46
): FittedText {
  const fontName = getFontFamily(language, 'body');

  // Try shrinking font size from defaultSize down to minSize
  for (let sz = defaultSize; sz >= minSize; sz -= 2) {
    const font = `800 ${sz}px ${fontName}`;
    const allFit = rawLines.every((line) => measureTextWidth(line, font) <= maxWidth);
    if (allFit) {
      return {
        lines: rawLines,
        fontSize: sz,
        lineHeight: Math.round(sz * 1.23),
        font,
        fits: true
      };
    }
  }

  // If still not fitting at minSize, check if words can be wrapped to fit
  const minFont = `800 ${minSize}px ${fontName}`;
  const fullText = rawLines.join(' ');
  const words = fullText.split(/\s+/);
  const wrapped: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureTextWidth(testLine, minFont) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) wrapped.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) wrapped.push(currentLine);

  // Total card height limit check (statement block max height ~ 220px)
  const lineHeight = Math.round(minSize * 1.23);
  const fits = wrapped.length <= 4 && wrapped.every((l) => measureTextWidth(l, minFont) <= maxWidth);

  return {
    lines: wrapped,
    fontSize: minSize,
    lineHeight,
    font: minFont,
    fits
  };
}

/**
 * Fits proof lines inside proof area (width ~ 560px).
 * Minimum font size: 30px.
 */
export function fitProofLines(
  rawLines: string[],
  language: string,
  maxWidth = 560,
  defaultSize = 32,
  minSize = 30
): FittedText {
  const fontName = getFontFamily(language, 'body');

  for (let sz = defaultSize; sz >= minSize; sz -= 1) {
    const font = `700 ${sz}px ${fontName}`;
    const allFit = rawLines.every((line) => measureTextWidth(line, font) <= maxWidth);
    if (allFit) {
      return {
        lines: rawLines,
        fontSize: sz,
        lineHeight: Math.round(sz * 1.38),
        font,
        fits: true
      };
    }
  }

  // Wrap at minSize
  const minFont = `700 ${minSize}px ${fontName}`;
  const fullText = rawLines.join(' ');
  const words = fullText.split(/\s+/);
  const wrapped: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (measureTextWidth(testLine, minFont) <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) wrapped.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) wrapped.push(currentLine);

  return {
    lines: wrapped,
    fontSize: minSize,
    lineHeight: Math.round(minSize * 1.38),
    font: minFont,
    fits: wrapped.length <= 3 && wrapped.every((l) => measureTextWidth(l, minFont) <= maxWidth)
  };
}

/**
 * Fits stamp text inside stamp box. Minimum size: 100px (or 80px for devanagari if wide).
 */
export function fitStampText(
  text: string,
  language: string,
  maxWidth = 250,
  defaultSize = 104,
  minSize = 100
): { fontSize: number; font: string } {
  const fontName = language === 'hi' ? getFontFamily('hi', 'anton') : 'Anton, Impact, sans-serif';
  const effectiveMin = language === 'hi' ? 84 : minSize;

  for (let sz = defaultSize; sz >= effectiveMin; sz -= 2) {
    const font = `400 ${sz}px ${fontName}`;
    if (measureTextWidth(text, font, 4) <= maxWidth) {
      return { fontSize: sz, font };
    }
  }
  return { fontSize: effectiveMin, font: `400 ${effectiveMin}px ${fontName}` };
}

/**
 * Validate that all rounds in a dataset fit within UI requirements.
 */
export function checkDatasetFits(data: VideoData): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  data.rounds.forEach((round, i) => {
    const statementFit = fitStatementLines(round.lines, data.language);
    if (!statementFit.fits) {
      issues.push(`Round ${i + 1} statement exceeds maximum allowed size (cannot fit at 46px minimum)`);
    }

    const proofFit = fitProofLines(round.proof, data.language);
    if (!proofFit.fits) {
      issues.push(`Round ${i + 1} proof exceeds maximum allowed size (cannot fit at 30px minimum)`);
    }
  });

  return {
    valid: issues.length === 0,
    issues
  };
}
