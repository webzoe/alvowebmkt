import { SYSTEM_PROMPT, buildUserMessage, extractJson, validateAIResult } from '../ai-prompt';
import type { AIReportInput, AIReportProvider, AIReportTextResult } from './interface';

const DEFAULT_MODEL = 'gpt-4o-mini';

export class OpenAIProvider implements AIReportProvider {
  constructor(private readonly apiKey: string, private readonly model = DEFAULT_MODEL) {}

  getProviderName() { return 'openai'; }
  getModelName()    { return this.model; }

  async generateCampaignReportText(input: AIReportInput): Promise<AIReportTextResult> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserMessage(input) },
        ],
        max_tokens: 2048,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    const parsed = extractJson(text);
    if (!parsed) throw new Error('OpenAI: resposta não é JSON válido');

    const result = validateAIResult(parsed, 'openai', this.model);
    if (!result) throw new Error('OpenAI: estrutura da resposta inválida');
    return result;
  }
}
