// lib/openai-client.ts
// OpenAI client - server-side only, never import in client components

import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

/**
 * Score a financial headline from -1 (very bearish) to 1 (very bullish).
 * Uses gpt-4o-mini for speed and cost efficiency.
 */
export async function scoreHeadlineSentiment(headline: string): Promise<number> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a financial sentiment analyzer. Given a financial headline, respond ONLY with a decimal number from -1.0 (extremely bearish) to 1.0 (extremely bullish). No explanation, just the number.',
      },
      { role: 'user', content: headline },
    ],
    max_tokens: 10,
    temperature: 0,
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '0';
  const score = parseFloat(text);
  return isNaN(score) ? 0 : Math.max(-1, Math.min(1, score));
}

/**
 * Generate a full AI trade thesis for a flagged setup.
 * Uses gpt-4o for institutional-quality analysis.
 */
export async function generateTradeTThesis(prompt: string): Promise<Record<string, unknown>> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an institutional quantitative trader. Generate precise, data-driven trade theses. Always respond with valid JSON only.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 500,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const text = response.choices[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Failed to parse AI response', raw: text };
  }
}
