import { APICallError, NoObjectGeneratedError } from 'ai';

export function safeAiError(error: unknown): string {
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