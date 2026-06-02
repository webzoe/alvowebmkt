import type { AIReportProvider } from './interface';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import type { Env } from '../../types';

export function createAIProvider(env: Env): AIReportProvider | null {
  const provider = env.AI_PROVIDER?.toLowerCase();

  switch (provider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurado');
      return new OpenAIProvider(env.OPENAI_API_KEY, env.AI_MODEL);

    case 'claude':
      if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurado');
      return new ClaudeProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL);

    case 'gemini':
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurado');
      return new GeminiProvider(env.GEMINI_API_KEY, env.AI_MODEL);

    case 'disabled':
    case undefined:
    default:
      return null;
  }
}
