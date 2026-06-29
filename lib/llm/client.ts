/**
 * Shared LLM Client
 *
 * Single entry point for all LLM calls across the platform.
 * Supports OpenAI, Anthropic, and DeepSeek with unified interface.
 *
 * Features:
 * - Timeout via AbortController
 * - Retry with exponential backoff (1s → 2s → 4s)
 * - Single key source per provider (env vars only)
 * - Graceful degradation when keys are missing
 *
 * Key sources:
 *   openai     → OPENAI_API_KEY
 *   anthropic  → ANTHROPIC_API_KEY
 *   deepseek   → DEEPSEEK_API_KEY
 */

export type LLMProvider = 'openai' | 'anthropic' | 'deepseek';

export interface LLMCallOptions {
  provider: LLMProvider;
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: LLMProvider;
}

// ── Provider Config ──────────────────────────────────────────────────

interface ProviderConfig {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  buildBody: (opts: LLMCallOptions) => unknown;
  extractContent: (data: Record<string, unknown>) => string;
  extractUsage: (data: Record<string, unknown>) => { inputTokens: number; outputTokens: number };
}

const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: (opts) => ({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 500,
    }),
    extractContent: (data) => (data.choices as Array<{ message: { content: string } }>)[0].message.content,
    extractUsage: (data) => {
      const u = data.usage as { prompt_tokens: number; completion_tokens: number } | undefined;
      return { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };
    },
  },

  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: (opts) => {
      // Anthropic separates system from messages
      const systemMessages = opts.messages.filter((m) => m.role === 'system').map((m) => m.content);
      const userAssistant = opts.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
      return {
        model: opts.model,
        max_tokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0,
        ...(systemMessages.length > 0 ? { system: systemMessages.join('\n') } : {}),
        messages: userAssistant.map((m) => ({ role: m.role, content: m.content })),
      };
    },
    extractContent: (data) => {
      const content = data.content as Array<{ type: string; text: string }>;
      return content[0]?.text ?? '';
    },
    extractUsage: (data) => {
      const u = data.usage as { input_tokens: number; output_tokens: number } | undefined;
      return { inputTokens: u?.input_tokens ?? 0, outputTokens: u?.output_tokens ?? 0 };
    },
  },

  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    }),
    buildBody: (opts) => ({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 500,
    }),
    extractContent: (data) => (data.choices as Array<{ message: { content: string } }>)[0].message.content,
    extractUsage: (data) => {
      const u = data.usage as { prompt_tokens: number; completion_tokens: number } | undefined;
      return { inputTokens: u?.prompt_tokens ?? 0, outputTokens: u?.completion_tokens ?? 0 };
    },
  },
};

// ── Key Resolution ───────────────────────────────────────────────────

function getApiKey(provider: LLMProvider): string {
  const keyMap: Record<LLMProvider, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
  };

  const envVar = keyMap[provider];
  const key = process.env[envVar];

  if (!key) {
    throw new Error(
      `[llmCall] ${envVar} is not configured. ` +
      `LLM provider "${provider}" is unavailable. ` +
      `Set the ${envVar} environment variable to enable it.`
    );
  }

  return key;
}

// ── Timeout Wrapper ──────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error(`[llmCall] Request timed out after ${timeoutMs}ms`));
      });
    }),
  ]).finally(() => clearTimeout(timeoutId)) as Promise<T>;
}

// ── Retry with Exponential Backoff ───────────────────────────────────

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry if the error is about a missing API key
      if (lastError.message.includes('is not configured')) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 16000);
        console.warn(
          `[llmCall] Attempt ${attempt + 1} failed, retrying in ${delayMs}ms: ${lastError.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// ── Main Client ──────────────────────────────────────────────────────

/**
 * Single entry point for all LLM calls.
 *
 * Handles: timeout, retry (exponential backoff), single key source.
 *
 * Key sources:
 *   openai     → OPENAI_API_KEY
 *   anthropic  → ANTHROPIC_API_KEY
 *   deepseek   → DEEPSEEK_API_KEY
 *
 * Degrades gracefully: if a provider's key is missing, throws a descriptive error.
 */
export async function llmCall(opts: LLMCallOptions): Promise<LLMResponse> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const maxRetries = opts.retries ?? 3;

  const apiKey = getApiKey(opts.provider);
  const config = PROVIDER_CONFIGS[opts.provider];

  return withRetry(async () => {
    const response = await withTimeout(
      fetch(config.url, {
        method: 'POST',
        headers: config.headers(apiKey),
        body: JSON.stringify(config.buildBody(opts)),
      }),
      timeoutMs,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `[llmCall] ${opts.provider} returned ${response.status}: ${body.slice(0, 500)}`
      );
    }

    const data = await response.json() as Record<string, unknown>;
    const content = config.extractContent(data);
    const usage = config.extractUsage(data);

    return {
      content,
      usage,
      model: opts.model,
      provider: opts.provider,
    };
  }, maxRetries);
}
