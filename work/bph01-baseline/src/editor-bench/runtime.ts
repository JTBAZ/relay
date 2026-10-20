import { parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { FileProviderBudget } from '../gallery-editor/budget.js';
import { createResponsesProvider, type EditorProvider, type ModelPricing } from '../gallery-editor/provider.js';
import { EditorError } from '../gallery-editor/types.js';
import { createPlanningProvider, type PlanningProvider } from '../conversational-planning/intent.js';

export const EDITOR_BENCH_MODEL = 'gpt-5.6-luna' as const;
export const EDITOR_BENCH_REASONING_EFFORT = 'none' as const;
const PRICING: ModelPricing = { inputUsdPerMillion: 0.20, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.20 };
const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_OUTPUT_TOKENS = 3_000;
const DEVELOPMENT_BUDGET_USD = 15;
const TOTAL_BUDGET_USD = 25;

export type BenchRuntimeStatus = {
  enabled: boolean;
  model: typeof EDITOR_BENCH_MODEL | null;
  reasoningEffort: typeof EDITOR_BENCH_REASONING_EFFORT | null;
  remainingUsd: number | null;
  reason: 'not_development' | 'live_flag_off' | 'ledger_unavailable' | 'missing_api_key' | 'budget_exhausted' | null;
};
export type EditorBenchRuntime = {
  status: BenchRuntimeStatus;
  editorProvider: EditorProvider | null;
  planningProvider: PlanningProvider | null;
};
export type EditorBenchRuntimeOptions = { repoRoot: string; env?: NodeJS.ProcessEnv; fetch?: typeof globalThis.fetch };
type LedgerRow = { id: string; model: string; phase: 'development' | 'heldout'; reservedUsd: number; actualUsd: number | null; settled: boolean; createdAt: string };

function validLedger(value: unknown): value is LedgerRow[] {
  return Array.isArray(value) && value.every(row => !!row && typeof row === 'object' &&
    typeof row.id === 'string' && typeof row.model === 'string' &&
    (row.phase === 'development' || row.phase === 'heldout') &&
    Number.isFinite(row.reservedUsd) && row.reservedUsd >= 0 &&
    (row.actualUsd === null || (Number.isFinite(row.actualUsd) && row.actualUsd >= 0)) &&
    typeof row.settled === 'boolean' && typeof row.createdAt === 'string');
}
async function ledgerState(path: string): Promise<{ remainingUsd: number; ledger: LedgerRow[] } | null> {
  try {
    const rows: unknown = JSON.parse(await readFile(path, 'utf8'));
    if (!validLedger(rows)) return null;
    const spent = (row: LedgerRow) => row.settled && row.actualUsd !== null ? row.actualUsd : row.reservedUsd;
    const dev = rows.filter(row => row.phase === 'development').reduce((sum, row) => sum + spent(row), 0);
    const total = rows.reduce((sum, row) => sum + spent(row), 0);
    return { remainingUsd: Number(Math.max(0, Math.min(DEVELOPMENT_BUDGET_USD - dev, TOTAL_BUDGET_USD - total)).toFixed(8)), ledger: rows };
  } catch { return null; }
}
function containsImage(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if ((value as Record<string, unknown>).type === 'input_image') return true;
  return Object.values(value).some(containsImage);
}
function status(reason: BenchRuntimeStatus['reason'], remainingUsd: number | null): BenchRuntimeStatus {
  const enabled = reason === null;
  return { enabled, model: enabled ? EDITOR_BENCH_MODEL : null, reasoningEffort: enabled ? EDITOR_BENCH_REASONING_EFFORT : null, remainingUsd, reason };
}

/** Server-only opt-in runtime. It never creates or repairs a missing ledger. */
export async function createEditorBenchRuntime(options: EditorBenchRuntimeOptions): Promise<EditorBenchRuntime> {
  const env = options.env ?? process.env;
  if (env.NODE_ENV !== 'development') return { status: status('not_development', null), editorProvider: null, planningProvider: null };
  const ledgerPath = join(resolve(options.repoRoot), '.relay-data', 'gallery-editor-budget.json');
  const current = await ledgerState(ledgerPath);
  if (!current) return { status: status('ledger_unavailable', null), editorProvider: null, planningProvider: null };
  if (env.RELAY_EDITOR_BENCH_LIVE !== '1') return { status: status('live_flag_off', current.remainingUsd), editorProvider: null, planningProvider: null };
  let apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    try { apiKey = parse(await readFile(join(resolve(options.repoRoot), '.env'), 'utf8')).OPENAI_API_KEY?.trim(); }
    catch { /* Missing key and unreadable dotenv have the same safe status. */ }
  }
  if (!apiKey) return { status: status('missing_api_key', current.remainingUsd), editorProvider: null, planningProvider: null };
  if (current.remainingUsd <= 0) return { status: status('budget_exhausted', current.remainingUsd), editorProvider: null, planningProvider: null };

  const budget = new FileProviderBudget(ledgerPath);
  const boundedFetch: typeof globalThis.fetch = async (input, init) => {
    if (String(input) !== ENDPOINT || init?.method !== 'POST') throw new EditorError('provider_config', 'The editor bench transport refused this request.', 503);
    let body: Record<string, unknown>;
    try { body = JSON.parse(String(init.body ?? '')) as Record<string, unknown>; }
    catch { throw new EditorError('provider_config', 'The editor bench request was invalid.', 503); }
    if (body.model !== EDITOR_BENCH_MODEL || body.max_output_tokens !== MAX_OUTPUT_TOKENS || containsImage(body)) throw new EditorError('provider_config', 'The editor bench request did not meet its runtime limits.', 503);
    body.reasoning = { effort: EDITOR_BENCH_REASONING_EFFORT };
    return (options.fetch ?? globalThis.fetch)(ENDPOINT, { ...init, body: JSON.stringify(body) });
  };
  const editorProvider = createResponsesProvider({ apiKey, model: EDITOR_BENCH_MODEL, pricing: PRICING, budget, phase: 'development', maxOutputTokens: MAX_OUTPUT_TOKENS, fetch: boundedFetch });
  const planningProvider = createPlanningProvider({ modelId: EDITOR_BENCH_MODEL, pricing: PRICING, budget, apiKey, phase: 'development', fetch: boundedFetch }, () => editorProvider);
  return { status: status(null, current.remainingUsd), editorProvider, planningProvider };
}
