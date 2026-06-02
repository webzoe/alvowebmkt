import { SYSTEM_PROMPT, buildUserMessage, extractJson, validateAIResult } from '../ai-prompt';
import type { AIReportInput, AIReportProvider, AIReportTextResult } from './interface';

const DEFAULT_MODEL = 'gemini-1.5-flash';

export class GeminiProvider implements AIReportProvider {
  constructor(private readonly apiKey: string, private readonly model = DEFAULT_MODEL) {}

  getProviderName() { return 'gemini'; }
  getModelName()    { return this.model; }

  async generateCampaignReportText(input: AIReportInput): Promise<AIReportTextResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: buildUserMessage(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 2048,
          temperature: 0.4,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = extractJson(text);
    if (!parsed) throw new Error('Gemini: resposta não é JSON válido');

    const result = validateAIResult(parsed, 'gemini', this.model);
    if (!result) throw new Error('Gemini: estrutura da resposta inválida');
    return result;
  }
}
