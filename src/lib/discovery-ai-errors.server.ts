import { APICallError, NoObjectGeneratedError } from 'ai';

export function aiAccessStatus(error: unknown): number | null {
  if (APICallError.isInstance(error) && (error.statusCode === 402 || error.statusCode === 403)) return error.statusCode;
  if (NoObjectGeneratedError.isInstance(error) && error.cause) return aiAccessStatus(error.cause);
  return null;
}

export function safeAiError(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error) && error.cause) return safeAiError(error.cause);
  if (APICallError.isInstance(error)) {
    try {
      const body = JSON.parse(error.responseBody ?? '{}');
      const message = body.message ?? body.error?.message;
      if (typeof message === 'string' && message) return message;
    } catch { /* Keep safe SDK message below. */ }
    return error.message;
  }
  if (NoObjectGeneratedError.isInstance(error)) return 'AI-tjänsten gav ingen giltig artbedömning. Fyndet sparades inte.';
  return error instanceof Error ? error.message : 'AI-identifieringen misslyckades. Fyndet sparades inte.';
}