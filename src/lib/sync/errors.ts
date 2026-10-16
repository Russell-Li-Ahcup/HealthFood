export const ETAG_CONFLICT = "ETAG_CONFLICT";

export function etagConflict(message = ETAG_CONFLICT): Error {
  return Object.assign(new Error(message), { code: ETAG_CONFLICT });
}

export function isEtagConflict(error: unknown): boolean {
  return error instanceof Error && (error.message === ETAG_CONFLICT || (error as { code?: unknown }).code === ETAG_CONFLICT);
}
