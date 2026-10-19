import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Application, Request, RequestHandler, Response } from "express";
import express from "express";
import { errorEnvelope, successEnvelope } from "../contracts/api.js";
import { requireAccount, type RequireAccountDeps } from "../identity/require-account.js";
import { RelayAuthError } from "../identity/relay-auth-error.js";
import type { IdentityService } from "../identity/identity-service.js";
import type { TrustedLookup } from "./compiler.js";
import type { ConversationalPlanningService, PlanningPrincipal, ResumePreparationBody, TurnResult } from "./service.js";
import type { ManualFieldPatch, PageCursor } from "./persistence.js";

export const CONVERSATIONAL_PLANNING_BASE = "/api/v1/conversational-planning";
export const CONVERSATIONAL_PLANNING_BODY_LIMIT = 16 * 1024;

export type PlanningRouteSettings = Readonly<{
  enabled?: string;
  allowlist?: string;
  aiEnabled?: string;
  /** Set only when AI is enabled and the exact configured model/pricing entry is valid. */
  aiAvailable?: boolean;
  preparationAvailable?: boolean;
}>;
/** A mutation restriction only; authentication and principal construction stay in this controller. */
export type StudioMutationGuard = (req: Request, res: Response, traceId: string, creatorId: string) => Promise<boolean>;
export type ConversationalPlanningRouteOptions = Readonly<{
  prisma: PrismaClient;
  identityService: IdentityService;
  service: ConversationalPlanningService;
  lookup: Pick<TrustedLookup, "hasAutopostEntitlement">;
  /** Composition-root proof that Prisma and IdentityService use the configured database stores. */
  databaseIdentityReady: boolean;
  settings: PlanningRouteSettings;
  /** Must wrap the existing Studio sync/write-lock guard and must not authorize a caller. */
  assertStudioMutationAllowed: StudioMutationGuard;
  logInfrastructureFailure?: (metadata: { traceId: string; operation: string }) => void;
}>;

type Owner = { principal: PlanningPrincipal; allowed: boolean; featureEnabled: boolean };
type JsonObject = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
const ownKeysAre = (value: JsonObject, keys: readonly string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const idOk = (value: unknown, max = 160): value is string => typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
const revisionOk = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const stringList = (value: unknown, maxCount: number): value is string[] => Array.isArray(value) && value.length <= maxCount && value.every(item => idOk(item)) && new Set(value).size === value.length;
const allowedTimezones = (value: unknown): value is string => typeof value === "string" && value.length <= 100 && (() => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } })();
const validLocalDateTime = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && (() => { const d = new Date(`${value}:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 16) === value; })();
const validLocalTime = (value: unknown): value is string => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

function traceIdFrom(req: Request): string {
  const supplied = req.header("x-trace-id")?.trim();
  return supplied && supplied.length <= 120 && /^[A-Za-z0-9._:-]+$/.test(supplied) ? supplied : `trace_cp_${randomUUID()}`;
}
function setPrivateHeaders(res: Response, traceId: string): void {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Trace-Id", traceId);
}
function sendError(res: Response, status: number, code: string, message: string, traceId: string, details?: Array<{ field: string; issue: string }>) {
  return res.status(status).json(errorEnvelope(code, message, traceId, details));
}

/** Mount this before the application's global express.json() so the transport stream is bounded. */
export function createConversationalPlanningJsonBodyParser(): RequestHandler {
  const parser = express.json({ limit: CONVERSATIONAL_PLANNING_BODY_LIMIT, strict: true, type: "application/json" });
  return (req, res, next) => {
    const traceId = traceIdFrom(req);
    setPrivateHeaders(res, traceId);
    if (req.body !== undefined) {
      let bytes: number;
      try { bytes = Buffer.byteLength(JSON.stringify(req.body), "utf8"); }
      catch { return sendError(res, 400, "INVALID_REQUEST", "Request body must be bounded JSON.", traceId); }
      if (bytes > CONVERSATIONAL_PLANNING_BODY_LIMIT) return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the 16-KiB limit.", traceId);
      return next();
    }
    const contentLength = req.header("content-length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > CONVERSATIONAL_PLANNING_BODY_LIMIT) return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body exceeds the 16-KiB limit.", traceId);
    parser(req, res, error => {
      if (!error) return next();
      const status = (error as { type?: string; status?: number }).type === "entity.too.large" || (error as { status?: number }).status === 413 ? 413 : 400;
      return sendError(res, status, status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST", status === 413 ? "Request body exceeds the 16-KiB limit." : "Request body must be valid JSON.", traceId);
    });
  };
}

function validCreateBody(value: unknown): value is { clientMutationKey: string; latestRequest: string; selectedPostIds: string[]; selectedMediaIds: string[]; selectedTemplateIds?: string[] } {
  if (!isRecord(value)) return false;
  const keys = ["clientMutationKey", "latestRequest", "selectedPostIds", "selectedMediaIds", ...(Object.hasOwn(value, "selectedTemplateIds") ? ["selectedTemplateIds"] : [])];
  return ownKeysAre(value, keys) && idOk(value.clientMutationKey) && typeof value.latestRequest === "string" && value.latestRequest.trim().length > 0 && value.latestRequest.length <= 4000 && stringList(value.selectedPostIds, 4) && stringList(value.selectedMediaIds, 3) && (value.selectedTemplateIds === undefined || stringList(value.selectedTemplateIds, 3));
}
function validCopy(value: unknown): boolean {
  return isRecord(value) && ownKeysAre(value, ["mode", "value", "origin"]) && value.mode === "literal" && value.origin === "creator" && typeof value.value === "string" && value.value.length > 0 && value.value.length <= 500;
}
function validTime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "absolute") {
    if (!ownKeysAre(value, ["kind", "at_utc", "timezone", "local"]) || typeof value.at_utc !== "string" || !Number.isFinite(Date.parse(value.at_utc)) || new Date(value.at_utc).toISOString() !== value.at_utc || !allowedTimezones(value.timezone) || !validLocalDateTime(value.local)) return false;
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: value.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const parts = Object.fromEntries(formatter.formatToParts(new Date(value.at_utc)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === value.local;
    } catch { return false; }
  }
  return value.kind === "after_publication_calendar_days" && ownKeysAre(value, ["kind", "anchor_step_id", "day_offset", "timezone", "local_time"]) && idOk(value.anchor_step_id) && (value.day_offset === 1 || value.day_offset === 2) && allowedTimezones(value.timezone) && validLocalTime(value.local_time);
}
function validManualPatch(value: unknown): value is ManualFieldPatch[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || !idOk(item.step_id)) return false;
    const key = `${item.step_id}\0${String(item.field)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (item.field === "title") { if (!ownKeysAre(item, ["step_id", "field", "value"]) || !validCopy(item.value)) return false; }
    else if (item.field === "note") { if (!ownKeysAre(item, ["step_id", "field", "value"]) || !(item.value === null || (typeof item.value === "string" && item.value.length <= 2000))) return false; }
    else if (item.field === "enabled") { if (!ownKeysAre(item, ["step_id", "field", "value"]) || typeof item.value !== "boolean") return false; }
    else if (item.field === "time") { if (!ownKeysAre(item, ["step_id", "field", "value"]) || !(item.value === null || validTime(item.value))) return false; }
    else return false;
  }
  return true;
}
function validReviseBody(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.mode === "ai") {
    const keys = ["mode", "clientMutationKey", "baseRevision", "latestRequest", "selectedPostIds", "selectedMediaIds", ...(Object.hasOwn(value, "selectedTemplateIds") ? ["selectedTemplateIds"] : []), ...(Object.hasOwn(value, "targetHandleRefs") ? ["targetHandleRefs"] : [])];
    if (!ownKeysAre(value, keys) || !revisionOk(value.baseRevision)) return false;
    const { mode: _mode, baseRevision: _revision, targetHandleRefs, ...createBody } = value;
    if (!validCreateBody(createBody)) return false;
    return targetHandleRefs === undefined || (Array.isArray(targetHandleRefs) && targetHandleRefs.length <= 8 && targetHandleRefs.every(ref => isRecord(ref) && ownKeysAre(ref, ["handle"]) && idOk(ref.handle, 100)) && new Set(targetHandleRefs.map(ref => (ref as { handle: string }).handle)).size === targetHandleRefs.length);
  }
  return value.mode === "manual" && ownKeysAre(value, ["mode", "clientMutationKey", "baseRevision", "patch"]) && idOk(value.clientMutationKey) && revisionOk(value.baseRevision) && validManualPatch(value.patch);
}
function validReviewBody(value: unknown): value is { clientMutationKey: string; baseRevision: number } {
  return isRecord(value) && ownKeysAre(value, ["clientMutationKey", "baseRevision"]) && idOk(value.clientMutationKey) && revisionOk(value.baseRevision);
}
function validResumePreparationBody(value: unknown): value is ResumePreparationBody {
  return isRecord(value) && ownKeysAre(value, ["approvedRevision"]) && revisionOk(value.approvedRevision);
}
function decodeCursor(value: unknown): PageCursor | null {
  if (typeof value !== "string" || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(decoded) || !ownKeysAre(decoded, ["updatedAt", "id"]) || typeof decoded.updatedAt !== "string" || !Number.isFinite(Date.parse(decoded.updatedAt)) || new Date(decoded.updatedAt).toISOString() !== decoded.updatedAt || !idOk(decoded.id)) return null;
    return { updatedAt: decoded.updatedAt, id: decoded.id };
  } catch { return null; }
}
function parseListQuery(req: Request): { limit: number; cursor?: PageCursor } | null {
  if (Object.keys(req.query).some(key => key !== "limit" && key !== "cursor")) return null;
  const limitText = req.query.limit;
  if (Array.isArray(limitText)) return null;
  const limit = limitText === undefined ? 50 : typeof limitText === "string" && /^\d{1,3}$/.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  const cursorText = req.query.cursor;
  if (Array.isArray(cursorText)) return null;
  if (cursorText === undefined) return { limit };
  const cursor = decodeCursor(cursorText);
  return cursor ? { limit, cursor } : null;
}
function allowlist(settings: PlanningRouteSettings): { enabled: boolean; ids: ReadonlySet<string> } {
  const ids = new Set((settings.allowlist ?? "").split(",").map(id => id.trim()).filter(Boolean));
  const enabled = settings.enabled === "1" && ids.size > 0 && !ids.has("*");
  return { enabled, ids };
}
function statusForServiceCode(code: string): { status: number; code: string; message: string } {
  switch (code) {
    case "invalid_request": return { status: 400, code: "INVALID_REQUEST", message: "The request is not valid." };
    case "too_large": return { status: 413, code: "PAYLOAD_TOO_LARGE", message: "The request exceeds a supported size limit." };
    case "not_found": return { status: 404, code: "NOT_FOUND", message: "The requested plan was not found." };
    case "creator_not_provisioned": return { status: 403, code: "CREATOR_NOT_PROVISIONED", message: "The creator workspace is not provisioned." };
    case "idempotency_conflict": return { status: 409, code: "IDEMPOTENCY_CONFLICT", message: "This mutation key was already used for a different request." };
    case "revision_conflict": return { status: 409, code: "REVISION_CONFLICT", message: "The plan changed. Reload it before trying again." };
    case "pointer_conflict": return { status: 409, code: "POINTER_CONFLICT", message: "A checked authority changed. Reload the plan before trying again." };
    case "stale_source": return { status: 409, code: "STALE_SOURCE", message: "The source changed. Refresh the plan before trying again." };
    case "authority_gap": return { status: 422, code: "AUTHORITY_GAP", message: "The plan is missing a required checked authority." };
    case "provider_budget_exhausted": return { status: 429, code: "PROVIDER_BUDGET_EXHAUSTED", message: "The planning request budget is exhausted." };
    case "provider_timeout": return { status: 504, code: "PROVIDER_TIMEOUT", message: "The planning request timed out." };
    case "provider_failure": return { status: 502, code: "PROVIDER_FAILURE", message: "The planning provider could not complete the request." };
    case "provider_usage_unavailable": return { status: 502, code: "PROVIDER_USAGE_UNAVAILABLE", message: "Provider usage could not be verified." };
    case "invalid_snapshot": return { status: 503, code: "SERVICE_UNAVAILABLE", message: "The stored plan could not be safely loaded." };
    default: return { status: 503, code: code === "provider_unavailable" ? "PROVIDER_UNAVAILABLE" : code === "provider_budget_unavailable" ? "PROVIDER_BUDGET_UNAVAILABLE" : code === "preparation_unavailable" ? "PREPARATION_UNAVAILABLE" : "SERVICE_UNAVAILABLE", message: "The planning service is temporarily unavailable." };
  }
}
function sendServiceError(res: Response, code: string, traceId: string) {
  const mapped = statusForServiceCode(code);
  return sendError(res, mapped.status, mapped.code, mapped.message, traceId);
}
function resultResponse(res: Response, result: TurnResult | Readonly<Record<string, unknown>>, traceId: string) {
  if (isRecord(result) && result.kind === "error" && typeof result.code === "string") return sendServiceError(res, result.code, traceId);
  if (isRecord(result) && result.kind === "preparation_unavailable") return sendError(res, 503, "PREPARATION_UNAVAILABLE", "Plan preparation is not available.", traceId);
  return res.status(200).json(successEnvelope(result, traceId));
}

/** Register the opt-in lifecycle API. Every route authenticates via requireAccount before using service inputs. */
export function registerConversationalPlanningRoutes(app: Application, options: ConversationalPlanningRouteOptions): void {
  if (!options || !options.prisma || !options.identityService || !options.service || !options.lookup || typeof options.assertStudioMutationAllowed !== "function") throw new Error("Conversational planning routes require database identity, service, lookup, and Studio mutation guard dependencies.");
  const { enabled: configured, ids } = allowlist(options.settings ?? {});
  const enabledFor = (creatorId: string) => configured && ids.has(creatorId);
  const api = express.Router();
  api.use((_req, res, next) => { const traceId = traceIdFrom(_req); setPrivateHeaders(res, traceId); next(); });

  const owner = async (req: Request, res: Response, traceId: string, operation: string, allowDisabled = false): Promise<Owner | null> => {
    if (options.databaseIdentityReady !== true || !options.prisma.account || !options.prisma.tenant || !options.prisma.tenantMembership || typeof options.prisma.$executeRawUnsafe !== "function") {
      sendError(res, 503, "DATABASE_IDENTITY_REQUIRED", "Database-backed account identity is unavailable.", traceId); return null;
    }
    let authenticated;
    try { authenticated = await requireAccount(req, { prisma: options.prisma, identityService: options.identityService, readonlySession: true } satisfies RequireAccountDeps); }
    catch (error) {
      if (error instanceof RelayAuthError) { res.status(error.status).json(error.toEnvelope(traceId)); return null; }
      options.logInfrastructureFailure?.({ traceId, operation });
      sendError(res, 503, "SERVICE_UNAVAILABLE", "Authentication could not be checked.", traceId); return null;
    }
    const creatorId = authenticated.context.primaryRelayCreatorId;
    if (!creatorId || !idOk(creatorId)) { sendError(res, 403, "CREATOR_NOT_LINKED", "This account has no linked creator workspace.", traceId); return null; }
    let tenant;
    try { tenant = await options.prisma.tenant.findUnique({ where: { relayCreatorId: creatorId }, select: { id: true, relayCreatorId: true } }); }
    catch { options.logInfrastructureFailure?.({ traceId, operation }); sendError(res, 503, "SERVICE_UNAVAILABLE", "Creator workspace access could not be checked.", traceId); return null; }
    if (!tenant || tenant.relayCreatorId !== creatorId) { sendError(res, 403, "CREATOR_NOT_PROVISIONED", "The creator workspace is not provisioned.", traceId); return null; }
    const isEnabled = enabledFor(creatorId);
    if (!allowDisabled && !isEnabled) { sendError(res, 403, "FEATURE_DISABLED", "Conversational planning is not enabled for this creator.", traceId); return null; }
    let entitled = false;
    try { entitled = await options.lookup.hasAutopostEntitlement(creatorId); }
    catch { options.logInfrastructureFailure?.({ traceId, operation }); sendError(res, 503, "SERVICE_UNAVAILABLE", "Creator plan access could not be checked.", traceId); return null; }
    if (!entitled) { sendError(res, 403, "PLAN_REQUIRED", "Conversational planning requires the Autopost plan.", traceId, [{ field: "required_plan", issue: "autopost" }]); return null; }
    return { principal: { accountId: authenticated.context.accountId, creatorId }, allowed: isEnabled, featureEnabled: options.settings?.enabled === "1" };
  };
  const handler = (operation: string, mutation: boolean, work: (req: Request, res: Response, traceId: string, principal: PlanningPrincipal) => Promise<unknown>, allowDisabled = false, allowedQueryKeys: readonly string[] = []): RequestHandler => async (req, res) => {
    const traceId = traceIdFrom(req); setPrivateHeaders(res, traceId);
    const currentOwner = await owner(req, res, traceId, operation, allowDisabled);
    if (!currentOwner) return;
    if (Object.keys(req.query).some(key => !allowedQueryKeys.includes(key))) { invalid(res, traceId, "Unexpected query parameters are not supported."); return; }
    if (mutation) {
      try {
        if (!(await options.assertStudioMutationAllowed(req, res, traceId, currentOwner.principal.creatorId))) {
          if (!res.headersSent) sendError(res, 423, "STUDIO_WRITE_LOCKED", "Studio writes are temporarily unavailable.", traceId);
          return;
        }
      } catch {
        options.logInfrastructureFailure?.({ traceId, operation });
        if (!res.headersSent) sendError(res, 503, "SERVICE_UNAVAILABLE", "Studio write access could not be checked.", traceId);
        return;
      }
    }
    try {
      const result = await work(req, res, traceId, currentOwner.principal);
      if (!res.headersSent && !res.writableEnded && result !== undefined) resultResponse(res, result as TurnResult, traceId);
    } catch {
      options.logInfrastructureFailure?.({ traceId, operation });
      if (!res.headersSent) sendError(res, 503, "SERVICE_UNAVAILABLE", "The planning service is temporarily unavailable.", traceId);
    }
  };
  const invalid = (res: Response, traceId: string, message = "The request is not valid.") => sendError(res, 400, "INVALID_REQUEST", message, traceId);

  api.get("/capabilities", handler("capabilities", false, async (_req, _res, _traceId, principal) => ({
    enabled: enabledFor(principal.creatorId), ai_enabled: enabledFor(principal.creatorId) && options.settings?.aiEnabled === "1", ai_available: enabledFor(principal.creatorId) && options.settings?.aiEnabled === "1" && options.settings?.aiAvailable === true, preparation_available: enabledFor(principal.creatorId) && options.settings?.preparationAvailable === true, required_plan: "autopost", entitled: true
  }), true));
  api.post("/plans", handler("create", true, async (req, res, traceId, principal) => {
    if (isRecord(req.body) && typeof req.body.latestRequest === "string" && req.body.latestRequest.length > 4000) return sendError(res, 413, "REQUEST_TOO_LARGE", "The latest request exceeds the 4,000-character limit.", traceId);
    if (!validCreateBody(req.body)) return invalid(res, traceId);
    const controller = new AbortController(); req.once("aborted", () => controller.abort());
    res.once("close", () => { if (!res.writableEnded) controller.abort(); });
    return options.service.create(principal, req.body, controller.signal);
  }));
  api.get("/plans", handler("list", false, async (req, res, traceId, principal) => {
    const page = parseListQuery(req); if (!page) return invalid(res, traceId, "The list cursor or limit is not valid.");
    return options.service.list(principal, page);
  }, false, ["limit", "cursor"]));
  api.get("/plans/:planId/preview", handler("preview", false, async (req, res, traceId, principal) => idOk(req.params.planId) ? options.service.preview(principal, req.params.planId) : invalid(res, traceId)));
  api.get("/plans/:planId", handler("get", false, async (req, res, traceId, principal) => idOk(req.params.planId) ? options.service.get(principal, req.params.planId) : invalid(res, traceId)));
  api.post("/plans/:planId/revise", handler("revise", true, async (req, res, traceId, principal) => {
    if (isRecord(req.body) && typeof req.body.latestRequest === "string" && req.body.latestRequest.length > 4000) return sendError(res, 413, "REQUEST_TOO_LARGE", "The latest request exceeds the 4,000-character limit.", traceId);
    if (!idOk(req.params.planId) || !validReviseBody(req.body)) return invalid(res, traceId);
    const controller = new AbortController(); req.once("aborted", () => controller.abort());
    res.once("close", () => { if (!res.writableEnded) controller.abort(); });
    return options.service.revise(principal, req.params.planId, req.body, controller.signal);
  }));
  for (const action of ["approve", "cancel", "confirm"] as const) api.post(`/plans/:planId/${action}`, handler(action, true, async (req, res, traceId, principal) => {
    if (!idOk(req.params.planId) || !validReviewBody(req.body)) return invalid(res, traceId);
    return options.service[action](principal, req.params.planId, req.body);
  }));
  api.post("/plans/:planId/resume-preparation", handler("resume_preparation", true, async (req, res, traceId, principal) => {
    if (!idOk(req.params.planId) || !validResumePreparationBody(req.body)) return invalid(res, traceId);
    if (options.settings?.preparationAvailable !== true) return sendError(res, 503, "PREPARATION_UNAVAILABLE", "Plan preparation is not available.", traceId);
    return options.service.resumePreparation(principal, req.params.planId, req.body);
  }));

  app.use(CONVERSATIONAL_PLANNING_BASE, api);
}

