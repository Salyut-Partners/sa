// Who the buyer is, read off the token they pasted. The platform's Bearer is a
// JWT whose `sub` is their own user id — the same id every topic of theirs
// carries — so the one thing a fresh install always has already says whose
// account it is. Without this a buyer with no launch folder yet has to find a
// topic id in the admin before the launches tab can show them anything.
//
// Nothing is verified: the signature is the platform's business, and a token
// that lies about its subject cannot read that subject's topics either. This
// decodes and no more, answering null for anything that is not a JWT carrying
// a positive whole `sub`.

/** Base64url → text, without Buffer: `core` is shared with the browser bundle. */
function decodeSegment(segment: string): string | null {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

/** The buyer's platform user id from their Bearer, or null when the token does not say. */
export function buyerIdFromToken(token: string | null): number | null {
  if (token === null) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const text = decodeSegment(parts[1]!);
  if (text === null) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null) return null;
  const sub = (payload as Record<string, unknown>)['sub'];
  if (typeof sub !== 'string' && typeof sub !== 'number') return null;
  const id = Number(sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}
