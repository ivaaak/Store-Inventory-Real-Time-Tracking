// src/services/visionService.ts
import fs from 'fs';
import OpenAI from 'openai';
import { AIAnalysisResult, VisualItemAnalysis } from '../types';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export type VisionProvider = 'openai' | 'mock';

/** Raised when the vision provider cannot produce a usable result. */
export class VisionError extends Error {
  constructor(message: string, public rawOutput?: string) {
    super(message);
    this.name = 'VisionError';
  }
}

export interface ExpectedProduct {
  name: string;
  /** Units the book says are on the shelf; only used by the mock provider. */
  systemCount: number;
}

let openaiClient: OpenAI | null = null;

/**
 * Which provider to use. `VISION_PROVIDER=mock` gives deterministic fake
 * counts for local development without an OpenAI key.
 */
export function getVisionProvider(): VisionProvider | null {
  const configured = process.env.VISION_PROVIDER?.toLowerCase();
  if (configured === 'mock') return 'mock';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

function getOpenAI(): OpenAI {
  // Constructed lazily: the SDK throws when the key is missing, which would
  // otherwise crash the whole server at import time.
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Analyze a shelf image and count each expected product.
 * Throws VisionError when the provider fails; callers must not treat a
 * failure as "shelf empty".
 */
export async function analyzeShelfImage(
  imagePath: string,
  mimeType: string,
  expected: ExpectedProduct[]
): Promise<AIAnalysisResult & { provider: VisionProvider }> {
  const provider = getVisionProvider();
  if (!provider) {
    throw new AppError(503, 'Vision AI is not configured. Set OPENAI_API_KEY, or VISION_PROVIDER=mock for local development.');
  }

  if (!fs.existsSync(imagePath)) {
    throw new VisionError(`Image file not found: ${imagePath}`);
  }

  logger.info('Starting vision analysis', { provider, productCount: expected.length });

  const result = provider === 'mock' ? mockAnalysis(expected) : await openAIAnalysis(imagePath, mimeType, expected);

  return { ...result, provider };
}

async function openAIAnalysis(
  imagePath: string,
  mimeType: string,
  expected: ExpectedProduct[]
): Promise<AIAnalysisResult> {
  const names = expected.map((p) => p.name);
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o';
  const base64Image = fs.readFileSync(imagePath).toString('base64');

  const systemPrompt = `You are a retail inventory assistant specialized in analyzing shelf images.
Count products on store shelves and assess their stock status.

Return a JSON object with this exact structure:
{
  "items": [
    { "name": "Product Name", "count": 0, "status": "EMPTY" | "LOW" | "FULL", "confidence": 0.0 }
  ]
}

Rules:
1. Only report these products, using exactly these names: ${names.join(', ')}
2. "count" is a non-negative integer
3. "status": EMPTY = 0 visible, LOW = 1-3 visible, FULL = 4+ visible
4. "confidence" (0.0-1.0) reflects how certain you are of the count
5. If a product is not visible, count 0 / EMPTY, with confidence reflecting how sure you are it is absent
6. Be conservative with counts - if unsure, estimate lower and lower your confidence
7. Count partially visible products if more than 50% visible`;

  const userPrompt = `Count each of these products on the shelf:
${names.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Return only valid JSON.`;

  let content: string | null | undefined;
  try {
    const response = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.2,
    });
    content = response.choices[0]?.message.content;
  } catch (error: any) {
    throw new VisionError(`Vision provider request failed: ${error.message}`);
  }

  if (!content) throw new VisionError('Vision provider returned an empty response');

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new VisionError('Vision provider returned invalid JSON', content);
  }
  if (!Array.isArray(parsed?.items)) {
    throw new VisionError('Vision response is missing the "items" array', content);
  }

  const byName = new Map(names.map((n) => [normalize(n), n]));
  const detectedItems: VisualItemAnalysis[] = [];

  for (const item of parsed.items) {
    const canonical = typeof item?.name === 'string' ? byName.get(normalize(item.name)) : undefined;
    if (!canonical || typeof item.count !== 'number') {
      logger.warn('Ignoring unrecognised item in vision response', { item });
      continue;
    }
    const count = Math.max(0, Math.floor(item.count));
    detectedItems.push({
      name: canonical,
      count,
      status: ['EMPTY', 'LOW', 'FULL', 'MISPLACED'].includes(item.status) ? item.status : statusFor(count),
      confidence: clamp01(typeof item.confidence === 'number' ? item.confidence : 0.5),
    });
  }

  // Products the model skipped are reported with zero confidence so the
  // reconciliation engine treats them as inconclusive rather than empty.
  for (const name of names) {
    if (!detectedItems.some((d) => d.name === name)) {
      logger.warn('Product missing from vision response', { product: name });
      detectedItems.push({ name, count: 0, status: 'EMPTY', confidence: 0 });
    }
  }

  return { timestamp: new Date(), detectedItems, rawOutput: content };
}

/**
 * Deterministic fake: usually matches the book, sometimes shows a shortfall
 * or an empty shelf so every alert path can be exercised locally.
 */
function mockAnalysis(expected: ExpectedProduct[]): AIAnalysisResult {
  const detectedItems = expected.map<VisualItemAnalysis>(({ name, systemCount }) => {
    const roll = Math.random();
    let count = systemCount;
    if (roll < 0.15) count = 0;
    else if (roll < 0.4) count = Math.max(0, systemCount - 1 - Math.floor(Math.random() * 5));
    return {
      name,
      count,
      status: statusFor(count),
      confidence: Number((0.82 + Math.random() * 0.16).toFixed(2)),
    };
  });

  return {
    timestamp: new Date(),
    detectedItems,
    rawOutput: JSON.stringify({ provider: 'mock', items: detectedItems }, null, 2),
  };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const statusFor = (count: number): VisualItemAnalysis['status'] => (count === 0 ? 'EMPTY' : count <= 3 ? 'LOW' : 'FULL');
