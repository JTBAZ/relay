import { EditorError } from './types.js';
import { PROPOSAL_SCHEMA } from './action-validation.js';

export type ResponseItem = Record<string, unknown>;
export interface ProviderUsage { inputTokens: number; outputTokens: number; costUsd?: number; calls?: number }
export interface EditorProvider {
  respond(request: { input: ResponseItem[]; tools: ResponseItem[]; signal: AbortSignal; responseSchema?: typeof PROPOSAL_SCHEMA }): Promise<{ output: ResponseItem[]; usage?: ProviderUsage }>;
}
/** Implement with an atomic durable ledger shared by all workers; never a process-local counter. */
export interface ProviderBudget {
  reserve(input: { model: string; amountUsd: number; phase: 'development' | 'heldout'; signal: AbortSignal }): Promise<string>;
  /** null means unknown billing: hold the complete reservation until reconciliation. */
  settle(id: string, actualUsd: number | null): Promise<void>;
}
export interface ModelPricing { inputUsdPerMillion: number; outputUsdPerMillion: number; cachedInputUsdPerMillion?: number; maxImageInputTokens?: number }
export interface ResponsesProviderOptions {
  apiKey?: string;
  model?: string;
  pricing?: ModelPricing;
  budget?: ProviderBudget;
  phase?: 'development' | 'heldout';
  maxOutputTokens?: number;
  fetch?: typeof globalThis.fetch;
}

function validRate(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function tokenCount(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }

/** Server-only. No user-controlled endpoint, model aliases, SDK globals, logging, or retries. */
export function createResponsesProvider(options: ResponsesProviderOptions): EditorProvider {
  const model = options.model?.trim() || 'gpt-6-astra';
  const maxOutputTokens = options.maxOutputTokens ?? 4000;
  return {
    async respond({ input, tools, signal, responseSchema }) {
      if (!options.apiKey?.trim()) throw new EditorError('provider_disabled', 'The conversational editor is not configured. Manual editing remains available.', 503);
      if (!options.budget || !options.pricing || !validRate(options.pricing.inputUsdPerMillion) || !validRate(options.pricing.outputUsdPerMillion)) throw new EditorError('provider_unpriced', 'The editor requires configured model pricing and a durable spending budget.', 503);
      if(options.pricing.cachedInputUsdPerMillion!==undefined&&(!validRate(options.pricing.cachedInputUsdPerMillion)||options.pricing.cachedInputUsdPerMillion>options.pricing.inputUsdPerMillion))throw new EditorError('provider_config','The cached-token rate is invalid.',503);
      if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 256 || maxOutputTokens > 16000) throw new EditorError('provider_config', 'The editor output limit is invalid.', 503);
      signal.throwIfAborted();
      const body = { model, store: false, input, tools, parallel_tool_calls: false, max_output_tokens: maxOutputTokens, include: ['reasoning.encrypted_content'], text: { format: { type: 'json_schema', name: 'library_edit_proposal', strict: true, schema: responseSchema ?? PROPOSAL_SCHEMA } } };
      let images = 0;
      // Account conservatively at one token per UTF-8 byte, plus explicit image allowance.
      const serialized = JSON.stringify(body, (_key, value) => {
        if (value && typeof value === 'object' && value.type === 'input_image') {
          images++;
          // Pixel tokens are reserved separately; base64 encoding is transport data,
          // not text prompt tokens. Keep surrounding structural fields accounted for.
          return { ...value, image_url: '[authorized image]' };
        }
        return value;
      });
      if (images > 24) throw new EditorError('image_limit', 'The editor can inspect at most 24 images per turn.');
      if (images && (!tokenCount(options.pricing.maxImageInputTokens) || options.pricing.maxImageInputTokens < 1)) throw new EditorError('provider_unpriced_images', 'Image inspection requires a configured model image token ceiling.', 503);
      const inputCeiling = Buffer.byteLength(serialized, 'utf8') + images * (options.pricing.maxImageInputTokens ?? 0) + 1024;
      // Keep configured short-context rates applicable; long-context pricing needs separate configuration.
      if(inputCeiling>272000)throw new EditorError('provider_context_limit','Narrow the request to fit the priced editor context.',413);
      const price = (inTokens: number, outTokens: number, cachedTokens=0) => ((inTokens-cachedTokens) * options.pricing!.inputUsdPerMillion + cachedTokens * (options.pricing!.cachedInputUsdPerMillion??options.pricing!.inputUsdPerMillion) + outTokens * options.pricing!.outputUsdPerMillion) / 1000000;
      const reservation = await options.budget.reserve({ model, phase: options.phase ?? 'development', amountUsd: price(inputCeiling, maxOutputTokens), signal });
      let settlement: number | null = null;
      let sent = false;
      try {
        signal.throwIfAborted();
        sent = true;
        const response = await (options.fetch ?? globalThis.fetch)('https://api.openai.com/v1/responses', {
          method: 'POST', signal, headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        // Do not expose provider error bodies, request IDs, URLs, metadata, or credentials.
        if (!response.ok) throw new EditorError('provider_error', 'The editor provider could not complete this request.', 502);
        const result = await response.json() as { status?: string; output?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?:{cached_tokens?:unknown} } };
        const inputTokens = result.usage?.input_tokens;
        const outputTokens = result.usage?.output_tokens;
        if (!tokenCount(inputTokens) || !tokenCount(outputTokens)) throw new EditorError('provider_usage_missing', 'The editor provider returned incomplete usage accounting.', 502);
        const cached=result.usage?.input_tokens_details?.cached_tokens??0;
        if(!tokenCount(cached)||cached>inputTokens)throw new EditorError('provider_usage_missing','The provider returned invalid cached-token accounting.',502);
        settlement = price(inputTokens, outputTokens,cached);
        if (inputTokens > inputCeiling || outputTokens > maxOutputTokens) throw new EditorError('provider_budget_overrun', 'The editor exceeded its configured token allowance. Review model pricing before retrying.', 503);
        if (result.status !== 'completed' || !Array.isArray(result.output) || result.output.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new EditorError('provider_incomplete', 'The editor did not finish a proposal. Try a smaller request.', 502);
        return { output: result.output as ResponseItem[], usage: { inputTokens, outputTokens, costUsd: settlement, calls: 1 } };
      } catch (error) {
        if (error instanceof EditorError || signal.aborted) throw error;
        throw new EditorError('provider_error', 'The editor provider could not complete this request.', 502);
      } finally {
        // Unknown charge (including an aborted request) consumes its reservation conservatively.
        await options.budget.settle(reservation, sent ? settlement : 0);
      }
    },
  };
}

/** Rates are explicit per configured model. Never infer another model's rates or key aliases. */
export function responsesProviderFromEnv(budget: ProviderBudget, env: NodeJS.ProcessEnv = process.env, fetch?: typeof globalThis.fetch): EditorProvider {
  const model = env.LIBRARY_EDITOR_MODEL?.trim() || 'gpt-6-astra';
  let pricing: ModelPricing | undefined;
  try {
    const prices = JSON.parse(env.LIBRARY_EDITOR_MODEL_PRICING_JSON ?? '{}') as Record<string, ModelPricing>;
    if (Object.hasOwn(prices, model)) pricing = prices[model];
  } catch { /* Missing or malformed pricing fails closed in respond. */ }
  return createResponsesProvider({ apiKey: env.OPENAI_API_KEY, model, pricing, budget, fetch });
}
