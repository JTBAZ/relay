/**
 * @fileoverview Standard JSON envelopes for Relay HTTP success and error responses with trace ids.
 */

/** @description Typed success envelope with trace metadata. */
export type ApiSuccess<T> = {
  data: T;
  meta: {
    trace_id: string;
  };
};

/** @description Standard API error shape for clients. */
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
    trace_id: string;
  };
};

/**
 * @description Wraps successful payload with standard `meta.trace_id`.
 * @param data Response body.
 * @param traceId Distributed trace id echoed to clients.
 * @returns `ApiSuccess` envelope.
 */
export function successEnvelope<T>(data: T, traceId: string): ApiSuccess<T> {
  return {
    data,
    meta: {
      trace_id: traceId
    }
  };
}

/**
 * @description Builds a transport-safe error object.
 * @param code Machine-readable error code.
 * @param message Human-readable summary.
 * @param traceId Distributed trace id.
 * @param details Optional field-level validation issues.
 * @returns `ApiError` envelope.
 */
export function errorEnvelope(
  code: string,
  message: string,
  traceId: string,
  details?: Array<{ field: string; issue: string }>
): ApiError {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      trace_id: traceId
    }
  };
}
