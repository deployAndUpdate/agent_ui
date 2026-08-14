/** Session ids: 1–64 chars, alphanumeric + _.:- */
const SESSION_RE = /^[A-Za-z0-9_.:-]{1,64}$/;

export function assertSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && SESSION_RE.test(sessionId);
}

export function sessionIdError(sessionId: unknown): string {
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    return 'sessionId is required';
  }
  return 'sessionId must match /^[A-Za-z0-9_.:-]{1,64}$/';
}
