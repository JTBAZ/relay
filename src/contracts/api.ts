export type ApiSuccess<T> = {
  data: T;
  meta: {
    trace_id: string;
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; issue: string }>;
    trace_id: string;
  };
};

export function successEnvelope<T>(data: T, traceId: string): ApiSuccess<T> {
  return {
    data,
    meta: {
      trace_id: traceId
    }
  };
}

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
