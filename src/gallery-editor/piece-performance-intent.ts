import { buildPiecePerformanceFindings, finalizePiecePerformanceAnswer, parsePiecePerformanceSelectionOutput, PERFORMANCE_SELECTION_SCHEMA, piecePerformanceSynthesisInput, PiecePerformanceAnswerTooLargeError, renderPiecePerformanceAnswerText, validatePiecePerformanceFactsResult, type PiecePerformanceAnswer } from "../analytics/piece-performance-findings.js";
import type { EditorProvider, ProviderUsage, ResponseItem } from "./provider.js";
import { EditorError, type EditAction } from "./types.js";
import { DISTRIBUTION_DESTINATIONS } from "../distribution/platform-destinations.js";

export type PerformanceReadArgs = { range: "7d" | "30d" | "90d"; destination: string | null };
export type PerformanceIntentResult = {
  message: string;
  actions: EditAction[];
  disposition: "no_change" | "limitation" | "clarification";
  performanceOutcome: "answer" | "clarification" | "limitation";
  usage?: ProviderUsage;
  performanceAnswer?: PiecePerformanceAnswer;
  routing: { repairs: number; escalations: number; reads: number; images: number };
};
const DESTINATIONS = new Set<string>([...DISTRIBUTION_DESTINATIONS, "relay"]);

export function isPerformanceReadArgs(value: unknown): value is PerformanceReadArgs {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 2 && Object.hasOwn(row, "range") && Object.hasOwn(row, "destination") &&
    ["7d", "30d", "90d"].includes(String(row.range)) && (row.destination === null || (typeof row.destination === "string" && DESTINATIONS.has(row.destination)));
}

function waitForSignal<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new EditorError("intent_timeout", "The editor turn ended before a performance answer was ready.", 408));
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new EditorError("intent_timeout", "The editor turn ended before a performance answer was ready.", 408));
    signal.addEventListener("abort", cancel, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

function result(answer: PiecePerformanceAnswer, actions: EditAction[], usage: ProviderUsage, usageKnown: boolean, routing: PerformanceIntentResult["routing"]): PerformanceIntentResult {
  return { message: answerMessage(answer), actions: structuredClone(actions), disposition: "no_change", performanceOutcome: "answer", performanceAnswer: answer, usage: { ...usage, ...(!usageKnown ? { costUsd: undefined } : {}) }, routing };
}
function limitation(message: string, actions: EditAction[], usage: ProviderUsage, usageKnown: boolean, routing: PerformanceIntentResult["routing"]): PerformanceIntentResult {
  return { message, actions: structuredClone(actions), disposition: "limitation", performanceOutcome: "limitation", usage: { ...usage, ...(!usageKnown ? { costUsd: undefined } : {}) }, routing };
}
function answerMessage(answer: PiecePerformanceAnswer): string { return renderPiecePerformanceAnswerText(answer); }
function boundedAnswer(input: { facts: Parameters<typeof finalizePiecePerformanceAnswer>[0]; findings: Parameters<typeof finalizePiecePerformanceAnswer>[1]; selection: Parameters<typeof finalizePiecePerformanceAnswer>[2]; synthesis: Parameters<typeof finalizePiecePerformanceAnswer>[3]; destination: string | null; mandatory: string[] }): PiecePerformanceAnswer | null {
  try { return finalizePiecePerformanceAnswer(input.facts, input.findings, input.selection, input.synthesis, input.destination, input.mandatory); }
  catch (error) { if (error instanceof PiecePerformanceAnswerTooLargeError) return null; throw error; }
}

/** Executes the single authenticated read and the optional final selection call. */
export async function runPiecePerformanceInterpretation(input: {
  args: PerformanceReadArgs;
  read: (args: PerformanceReadArgs) => Promise<unknown>;
  provider: EditorProvider;
  signal: AbortSignal;
  actions: EditAction[];
  usage: ProviderUsage;
  usageKnown: { value: boolean };
  routing: { repairs: number; escalations: number; reads: number; images: number };
}): Promise<PerformanceIntentResult> {
  const routing = { ...input.routing, reads: input.routing.reads + 1 };
  const raw = await waitForSignal(() => input.read(input.args), input.signal);
  if (input.signal.aborted && input.signal.reason !== "deadline") throw new EditorError("intent_aborted", "The editor request was canceled.", 408);
  const checked = validatePiecePerformanceFactsResult(raw);
  if (!checked.ok) {
    if (checked.code === "TOO_BROAD") return limitation("This performance scope contains more evidence than can be safely summarized. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);
    if (["INVALID_SELECTION", "INVALID_ARGUMENT", "NOT_FOUND"].includes(checked.code)) return { message: "I could not resolve the selected piece for a performance read. Confirm the piece selection and try again.", actions: structuredClone(input.actions), disposition: "clarification", performanceOutcome: "clarification", usage: { ...input.usage, ...(!input.usageKnown.value ? { costUsd: undefined } : {}) }, routing };
    throw new EditorError("performance_unavailable", "Performance evidence could not be read. Your current cart is unchanged.", 503);
  }
  const facts = checked.facts;
  const prepared = buildPiecePerformanceFindings(facts);
  if (!prepared.ok) return limitation("This performance scope contains more evidence than can be safely summarized. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);
  if (facts.status === "no_data") {
    const answer = boundedAnswer({ facts, findings: prepared.findings, selection: null, synthesis: { status: "deterministic", reason: "no_data" }, destination: input.args.destination, mandatory: prepared.mandatory_finding_ids });
    if (!answer) return limitation("This performance scope contains too much separate evidence for one concise answer. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);
    return result(answer, input.actions, input.usage, input.usageKnown.value, routing);
  }

  const maximalAnswer = boundedAnswer({ facts, findings: prepared.findings, selection: { kind: "performance_answer", summary_finding_ids: prepared.findings.map(item => item.id), insight_finding_ids: [] }, synthesis: { status: "deterministic", reason: "provider_unavailable" }, destination: input.args.destination, mandatory: prepared.mandatory_finding_ids });
  if (!maximalAnswer) return limitation("This performance scope contains too much separate evidence for one concise answer. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);

  const synthesisInput: ResponseItem[] = piecePerformanceSynthesisInput(prepared.findings);
  const request = { input: synthesisInput, tools: [], signal: input.signal, responseSchema: PERFORMANCE_SELECTION_SCHEMA as unknown as Record<string, unknown> };
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > 16 * 1024) return limitation("This performance scope contains too much separate evidence for one concise answer. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);

  let selection: ReturnType<typeof parsePiecePerformanceSelectionOutput> | null = null;
  let failure: PiecePerformanceAnswer["synthesis"]["reason"] = null;
  let responseReceived = false;
  let responseCostKnown = false;
  input.usage.calls = (input.usage.calls ?? 0) + 1;
  try {
    const response = await waitForSignal(() => input.provider.respond(request), input.signal);
    responseReceived = true;
    if (response.usage && Number.isSafeInteger(response.usage.inputTokens) && response.usage.inputTokens >= 0 && Number.isSafeInteger(response.usage.outputTokens) && response.usage.outputTokens >= 0) {
      input.usage.inputTokens += response.usage.inputTokens;
      input.usage.outputTokens += response.usage.outputTokens;
      if (typeof response.usage.costUsd === "number" && Number.isFinite(response.usage.costUsd) && response.usage.costUsd >= 0) { input.usage.costUsd = (input.usage.costUsd ?? 0) + response.usage.costUsd; responseCostKnown = true; }
      else input.usageKnown.value = false;
    } else input.usageKnown.value = false;
    if (input.signal.aborted) throw new EditorError("intent_timeout", "The editor turn ended before a performance answer was ready.", 408);
    selection = parsePiecePerformanceSelectionOutput(response.output, prepared.findings, false);
  } catch (error) {
    if (input.signal.aborted && input.signal.reason !== "deadline") throw new EditorError("intent_aborted", "The editor request was canceled.", 408);
    if (!responseReceived || !responseCostKnown) input.usageKnown.value = false;
    failure = input.signal.reason === "deadline" ? "timeout" : error instanceof SyntaxError || error instanceof Error && /selection|refusal/i.test(error.message) ? "invalid_output" : error instanceof Error && /budget/i.test(`${(error as Error & { code?: string }).code ?? ""} ${error.message}`) ? "budget" : "provider_unavailable";
  }
  const answer = boundedAnswer({ facts, findings: prepared.findings, selection, synthesis: { status: selection ? "ai_selected" : "deterministic", reason: selection ? null : failure ?? "provider_unavailable" }, destination: input.args.destination, mandatory: prepared.mandatory_finding_ids });
  if (!answer) return limitation("This performance scope contains too much separate evidence for one concise answer. Narrow the selected piece or platform and try again.", input.actions, input.usage, input.usageKnown.value, routing);
  return { ...result(answer, input.actions, input.usage, input.usageKnown.value, routing), message: answerMessage(answer) };
}
