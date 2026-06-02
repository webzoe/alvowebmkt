import { SYSTEM_PROMPT, buildUserMessage, extractJson, validateAIResult } from '../ai-prompt';
import type { AIReportInput, AIReportProvider, AIReportTextResult } from './interface';

const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';

export class ClaudeProvider implements AIReportProvider {
  constructor(private readonly apiKey: string, private readonly model = DEFAULT_MODEL) {}

  getProviderName() { return 'claude'; }
  getModelName()    { return this.model; }

  async generateCampaignReportText(input: AIReportInput): Promise<AIReportTextResult> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: buildUserMessage(input) },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as { content: { type: string; text: string }[] };
    const text = data.content?.find(c => c.type === 'text')?.text ?? '';
    const parsed = extractJson(text);
    if (!parsed) throw new Error('Claude: resposta não é JSON válido');

    const result = validateAIResult(parsed, 'claude', this.model);
    if (!result) throw new Error('Claude: estrutura da resposta inválida');
    return result;
  }
}
