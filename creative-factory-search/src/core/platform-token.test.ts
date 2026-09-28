import { describe, expect, it } from 'vitest';
import { buyerIdFromToken } from './platform-token.ts';

/** A JWT with the given payload; the signature is never looked at, so it is a word. */
const jwt = (payload: unknown): string => {
  const part = (value: unknown): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part({ typ: 'JWT', alg: 'RS256' })}.${part(payload)}.signature`;
};

describe('buyerIdFromToken', () => {
  it('is the `sub` of the platform Bearer, which the platform writes as a string', () => {
    expect(buyerIdFromToken(jwt({ aud: '1', sub: '1099', scopes: [] }))).toBe(1099);
  });

  it('takes a numeric `sub` too, and pads a payload whose base64 length is not a multiple of four', () => {
    expect(buyerIdFromToken(jwt({ sub: 1086 }))).toBe(1086);
    expect(buyerIdFromToken(jwt({ sub: '7', a: 'bc' }))).toBe(7);
  });

  it('is null for no token, a token that is not a JWT, and a payload that is not JSON', () => {
    expect(buyerIdFromToken(null)).toBeNull();
    expect(buyerIdFromToken('')).toBeNull();
    expect(buyerIdFromToken('not-a-jwt')).toBeNull();
    expect(buyerIdFromToken('a.b.c')).toBeNull();
  });

  it('is null when `sub` is missing, empty, not a number, or not a positive whole one', () => {
    expect(buyerIdFromToken(jwt({ aud: '1' }))).toBeNull();
    expect(buyerIdFromToken(jwt({ sub: '' }))).toBeNull();
    expect(buyerIdFromToken(jwt({ sub: 'artem' }))).toBeNull();
    expect(buyerIdFromToken(jwt({ sub: 0 }))).toBeNull();
    expect(buyerIdFromToken(jwt({ sub: -3 }))).toBeNull();
    expect(buyerIdFromToken(jwt({ sub: 10.5 }))).toBeNull();
    expect(buyerIdFromToken(jwt(['1099']))).toBeNull();
  });
});
