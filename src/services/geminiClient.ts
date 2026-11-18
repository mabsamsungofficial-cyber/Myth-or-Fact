import type { Language, VideoData, RoundData } from '../engine/types.ts';
import { fitProofLines, fitStatementLines } from '../engine/textFit.ts';
import { storage, type ModelOption } from './storage.ts';

export interface GroundingSource {
  title?: string;
  url?: string;
}

export class GeminiAPIError extends Error {
  statusCode?: number;
  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = 'GeminiAPIError';
    this.statusCode = statusCode;
  }
}

/**
 * Normalizes model names by stripping any leading slashes or 'models/' prefix.
 */
export function cleanModelName(model: string): string {
  if (!model) return 'gemini-2.5-flash';
  let cleaned = model.trim();
  cleaned = cleaned.replace(/^\/+/, '');
  cleaned = cleaned.replace(/^models\//i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned || 'gemini-2.5-flash';
}

function cleanMarkdownJson(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  return cleaned;
}

/**
 * Fetch the active models accessible to the user's API key via the ListModels API.
 */
export async function fetchAvailableModels(apiKey: string): Promise<ModelOption[]> {
  const key = apiKey.trim();
  if (!key) {
    throw new GeminiAPIError('Please enter an API key to test.', 401);
  }

  const endpoints = [
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`
  ];

  let lastErr = 'Unable to connect to Google Generative Language service.';
  let lastStatus = 500;

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        lastStatus = res.status;
        lastErr = data?.error?.message || res.statusText || 'Error fetching models';
        if (res.status === 400 || res.status === 403) {
          throw new GeminiAPIError(lastErr, res.status);
        }
        continue;
      }

      const rawModels: any[] = Array.isArray(data?.models) ? data.models : [];
      const contentModels = rawModels.filter((m) => {
        const methods: string[] = Array.isArray(m.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        return methods.includes('generateContent');
      });

      if (contentModels.length === 0 && rawModels.length > 0) {
        return rawModels.map((m) => ({
          id: cleanModelName(m.name),
          displayName: m.displayName || cleanModelName(m.name)
        }));
      }

      const results: ModelOption[] = contentModels.map((m) => ({
        id: cleanModelName(m.name),
        displayName: m.displayName ? `${m.displayName} (${cleanModelName(m.name)})` : cleanModelName(m.name)
      }));

      // Sort models: Flash models first, then Pro models
      results.sort((a, b) => {
        const aFlash = a.id.includes('flash');
        const bFlash = b.id.includes('flash');
        if (aFlash && !bFlash) return -1;
        if (!aFlash && bFlash) return 1;
        return a.id.localeCompare(b.id);
      });

      return results;
    } catch (err: any) {
      if (err instanceof GeminiAPIError) throw err;
      lastErr = err?.message || 'Network error while contacting Google API.';
    }
  }

  throw new GeminiAPIError(lastErr, lastStatus);
}

/**
 * Quick validation for Settings screen to test API key & auto-populate available models.
 */
export async function testGeminiApiKey(
  apiKey: string
): Promise<{ ok: boolean; models?: ModelOption[]; error?: string }> {
  try {
    const models = await fetchAvailableModels(apiKey);
    return { ok: true, models };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'API connection failed' };
  }
}

/**
 * Executes a Gemini request with automatic endpoint fallback (v1beta -> v1)
 * and self-healing model fallback if the selected model returns 404.
 */
async function sendGeminiRequest(
  apiKey: string,
  model: string,
  body: any
): Promise<{ response: Response; usedModel: string; endpoint: string }> {
  const cleanModel = cleanModelName(model);
  const key = apiKey.trim();

  const endpoints = ['v1beta', 'v1'];

  for (const ep of endpoints) {
    const url = `https://generativelanguage.googleapis.com/${ep}/models/${cleanModel}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok || (res.status !== 404 && res.status !== 503)) {
        return { response: res, usedModel: cleanModel, endpoint: ep };
      }
    } catch (e) {
      // Continue to next endpoint attempt
    }
  }

  // If 404 on both v1beta and v1, attempt self-healing by fetching models for this key
  try {
    const available = await fetchAvailableModels(key);
    const fallbackCandidate =
      available.find((m) => m.id.includes('2.5-flash')) ||
      available.find((m) => m.id.includes('2.0-flash')) ||
      available.find((m) => m.id.includes('flash')) ||
      available[0];

    if (fallbackCandidate && fallbackCandidate.id !== cleanModel) {
      console.warn(`Model "${cleanModel}" was not found (404). Auto-switching to "${fallbackCandidate.id}".`);
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackCandidate.id}:generateContent?key=${encodeURIComponent(key)}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (fallbackRes.ok) {
        // Persist newly discovered working model
        const currentSettings = storage.getSettings();
        currentSettings.geminiModel = fallbackCandidate.id;
        currentSettings.availableModels = available;
        await storage.saveSettings(currentSettings);
        return { response: fallbackRes, usedModel: fallbackCandidate.id, endpoint: 'v1beta' };
      }
    }
  } catch {}

  // If still not resolved, perform one final call to capture Google's exact error message
  const finalUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(key)}`;
  const finalRes = await fetch(finalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { response: finalRes, usedModel: cleanModel, endpoint: 'v1beta' };
}

/**
 * Step 1: Research topic using Google Search Grounding with fallback to standard generation
 */
async function callGeminiResearch(
  apiKey: string,
  model: string,
  topic: string,
  roundsCount: number
): Promise<{ researchText: string; sources: GroundingSource[]; activeModel: string }> {
  const prompt = `You are an expert factual researcher.
Topic: "${topic}"
Generate ${roundsCount} popular, checkable myths or facts about "${topic}".

STRICT ACCURACY RULES:
1. Every claim must be a popular, common belief or question.
2. The verdict must be explicitly MYTH or FACT based on established scientific or institutional consensus (WHO, NIH, CDC, Mayo Clinic, peer-reviewed science).
3. Do NOT invent studies, fake statistics, or nonexistent sources.
4. For each claim, provide:
   - Statement: Concise claim
   - Verdict: MYTH or FACT
   - Evidence: 1-2 factual sentences explaining verified studies
   - Source: Real authoritative website URL
   - Confidence: "high", "medium", or "low"`;

  const requestWithSearch = {
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }]
  };

  let { response, usedModel } = await sendGeminiRequest(apiKey, model, requestWithSearch);
  let usedSearch = true;

  // If search tool returned 400 (e.g. search tool not supported on specific model/region), retry without search tool
  if (!response.ok && response.status === 400) {
    usedSearch = false;
    const requestPlain = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    const plainResult = await sendGeminiRequest(apiKey, usedModel, requestPlain);
    response = plainResult.response;
    usedModel = plainResult.usedModel;
  }

  if (!response.ok) {
    let errorDetail = '';
    try {
      const errJson = await response.json();
      errorDetail = errJson?.error?.message || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }

    if (response.status === 400 || response.status === 403) {
      throw new GeminiAPIError(
        `Gemini API error (${response.status}): ${errorDetail}. Please check your API key in Settings.`,
        response.status
      );
    }
    if (response.status === 429) {
      throw new GeminiAPIError(
        'Gemini rate limit exceeded. Please wait a few moments and try again.',
        429
      );
    }
    if (response.status === 404) {
      throw new GeminiAPIError(
        `Model "${usedModel}" was not found (404): ${errorDetail}. Open Settings and tap "Test Connection" to refresh available models.`,
        404
      );
    }
    throw new GeminiAPIError(`Gemini Research Error (${response.status}): ${errorDetail}`, response.status);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];
  const researchText = candidate?.content?.parts?.[0]?.text || '';

  const sources: GroundingSource[] = [];
  if (usedSearch) {
    const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
    for (const chunk of groundingChunks) {
      if (chunk?.web?.uri) {
        sources.push({
          title: chunk.web.title || '',
          url: chunk.web.uri
        });
      }
    }
  }

  return { researchText, sources, activeModel: usedModel };
}

/**
 * Step 2: Format research text into strictly structured JSON schema
 */
async function callGeminiFormat(
  apiKey: string,
  model: string,
  researchText: string,
  language: Language,
  roundsCount: number,
  sources: GroundingSource[],
  correctionFeedback?: string
): Promise<VideoData> {
  let langInstruction = '';
  if (language === 'hinglish') {
    langInstruction = 'Target Language: HINGLISH. Write in natural conversational Hindi using English/Latin alphabet (e.g., "Knuckles todne se arthritis hoti hai", "Zukaam virus se hota hai"). Do not write pure English sentences.';
  } else if (language === 'hi') {
    langInstruction = 'Target Language: HINDI. Write in natural Hindi using Devanagari script (e.g., "रात को फल खाने से वजन बढ़ता है।").';
  } else {
    langInstruction = 'Target Language: ENGLISH. Write in punchy, concise English.';
  }

  const prompt = `Convert the following research findings into structured JSON for a 9:16 vertical video.

RESEARCH DATA:
${researchText}

KNOWN SOURCES:
${sources.map((s) => `- ${s.title}: ${s.url}`).join('\n')}

${langInstruction}
TARGET ROUNDS: Exactly ${roundsCount} rounds.

CRITICAL LENGTH CONSTRAINTS:
1. "lines": Array of 2 to 3 short strings. STRICT MAXIMUM 18 CHARACTERS per line! Split sentences across 2 or 3 lines.
2. "fact": Boolean (true if FACT, false if MYTH).
3. "proof": Array of 1 to 2 strings. STRICT MAXIMUM 32 CHARACTERS per line!
4. "source": Real authoritative URL string.
5. "confidence": "high", "medium", or "low".
6. "recap": Array of ${roundsCount} short labels (max 22 characters each).

${correctionFeedback ? `CORRECTION NOTE:\n${correctionFeedback}\nEnsure every line strictly fits character limits!` : ''}

Output ONLY valid JSON matching this structure:
{
  "language": "${language}",
  "rounds": [
    {
      "lines": ["line 1 (max 18)", "line 2 (max 18)"],
      "fact": true,
      "proof": ["proof line 1 (max 32)", "proof line 2 (max 32)"],
      "source": "https://...",
      "confidence": "high"
    }
  ],
  "recap": ["short label 1", "short label 2"]
}`;

  const schema = {
    type: 'OBJECT',
    properties: {
      language: { type: 'STRING' },
      rounds: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            lines: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            fact: { type: 'BOOLEAN' },
            proof: {
              type: 'ARRAY',
              items: { type: 'STRING' }
            },
            source: { type: 'STRING' },
            confidence: { type: 'STRING' }
          },
          required: ['lines', 'fact', 'proof', 'source', 'confidence']
        }
      },
      recap: {
        type: 'ARRAY',
        items: { type: 'STRING' }
      }
    },
    required: ['language', 'rounds', 'recap']
  };

  const requestWithSchema = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.2
    }
  };

  let { response, usedModel } = await sendGeminiRequest(apiKey, model, requestWithSchema);

  // If responseSchema caused a 400 error on certain models, retry with responseMimeType only
  if (!response.ok && response.status === 400) {
    const requestMimeOnly = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    };
    const retryRes = await sendGeminiRequest(apiKey, usedModel, requestMimeOnly);
    response = retryRes.response;
  }

  if (!response.ok) {
    let errText = '';
    try {
      const errJson = await response.json();
      errText = errJson?.error?.message || response.statusText;
    } catch {
      errText = await response.text();
    }
    throw new GeminiAPIError(`Gemini Format Error (${response.status}): ${errText}`, response.status);
  }

  const resJson = await response.json();
  const rawContent = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new GeminiAPIError('Gemini returned an empty response. Please try again.', 500);
  }

  const cleaned = cleanMarkdownJson(rawContent);
  try {
    return JSON.parse(cleaned) as VideoData;
  } catch (parseErr) {
    throw new GeminiAPIError(`JSON syntax parsing error: ${cleaned.substring(0, 100)}...`, 500);
  }
}

/**
 * Strict validator and sanitizer for video data
 */
export function validateAndSanitizeData(
  data: any,
  targetLang: Language,
  targetRounds: number,
  fallbackSources: GroundingSource[]
): { valid: boolean; issues: string[]; sanitized?: VideoData } {
  const issues: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, issues: ['Response is not a valid JSON object'] };
  }

  if (!Array.isArray(data.rounds) || data.rounds.length === 0) {
    return { valid: false, issues: ['"rounds" array is missing or empty'] };
  }

  const rounds: RoundData[] = [];
  const countToUse = Math.min(Math.max(3, data.rounds.length), targetRounds);

  for (let i = 0; i < countToUse; i++) {
    const r = data.rounds[i];
    if (!r) break;

    // Sanitize statement lines
    let lines = Array.isArray(r.lines)
      ? r.lines.map((l: any) => String(l || '').trim()).filter((l: string) => l.length > 0)
      : [];
    if (lines.length === 0) lines = ['Statement'];

    for (const l of lines) {
      if (l.length > 22) {
        issues.push(`Round ${i + 1} claim line exceeds length (${l.length} chars): "${l}"`);
      }
    }

    const fitCheck = fitStatementLines(lines, targetLang);
    if (!fitCheck.fits) {
      issues.push(`Round ${i + 1} statement does not fit inside card boundaries`);
    }

    // Sanitize proof lines
    let proof = Array.isArray(r.proof)
      ? r.proof.map((p: any) => String(p || '').trim()).filter((p: string) => p.length > 0)
      : [];
    if (proof.length === 0) proof = ['Scientific evidence summary'];

    for (const p of proof) {
      if (p.length > 38) {
        issues.push(`Round ${i + 1} proof line exceeds length (${p.length} chars): "${p}"`);
      }
    }

    const proofFit = fitProofLines(proof, targetLang);
    if (!proofFit.fits) {
      issues.push(`Round ${i + 1} proof does not fit inside proof boundaries`);
    }

    let source = typeof r.source === 'string' && r.source.startsWith('http') ? r.source : '';
    if (!source && fallbackSources[i]?.url) {
      source = fallbackSources[i].url!;
    }

    const confidence = ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'high';

    rounds.push({
      lines,
      fact: Boolean(r.fact),
      proof,
      source: source || 'https://www.google.com/search?q=fact+check',
      confidence
    });
  }

  let recap: string[] = [];
  if (Array.isArray(data.recap)) {
    recap = data.recap.slice(0, rounds.length).map((x: any) => String(x || '').trim());
  }
  while (recap.length < rounds.length) {
    const idx = recap.length;
    recap.push(rounds[idx]?.lines?.[0] || `Claim #${idx + 1}`);
  }

  const sanitized: VideoData = {
    language: targetLang,
    rounds,
    recap
  };

  return {
    valid: issues.length === 0,
    issues,
    sanitized
  };
}

/**
 * Main Generator function called by UI
 */
export async function generateWithGemini(
  topic: string,
  language: Language,
  roundsCount: number
): Promise<VideoData> {
  const settings = storage.getSettings();
  const apiKey = settings.geminiApiKey?.trim();
  const model = cleanModelName(settings.geminiModel || 'gemini-2.5-flash');

  if (!apiKey) {
    throw new GeminiAPIError(
      'Gemini API key is required. Open Settings in the top right to configure your API key.',
      401
    );
  }

  // Step 1: Research
  const { researchText, sources, activeModel } = await callGeminiResearch(apiKey, model, topic, roundsCount);

  // Step 2: Format
  const formattedData = await callGeminiFormat(apiKey, activeModel, researchText, language, roundsCount, sources);

  // Validate output
  const check1 = validateAndSanitizeData(formattedData, language, roundsCount, sources);
  if (check1.valid && check1.sanitized) {
    check1.sanitized.topic = topic;
    return check1.sanitized;
  }

  // Automatic retry if validation had length/fit issues
  const feedback = `Previous attempt had formatting issues: ${check1.issues.join('; ')}. Ensure statement lines are strictly under 18 characters and proof lines under 32 characters.`;
  try {
    const retryData = await callGeminiFormat(apiKey, activeModel, researchText, language, roundsCount, sources, feedback);
    const check2 = validateAndSanitizeData(retryData, language, roundsCount, sources);
    if (check2.sanitized) {
      check2.sanitized.topic = topic;
      return check2.sanitized;
    }
  } catch {}

  if (check1.sanitized) {
    check1.sanitized.topic = topic;
    return check1.sanitized;
  }

  throw new GeminiAPIError(
    `Failed to format valid claims: ${check1.issues.slice(0, 2).join(', ')}`,
    500
  );
}
