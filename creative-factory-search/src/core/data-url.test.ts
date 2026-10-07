import { describe, expect, it } from 'vitest';
import { decodeDataUrl, extensionFor } from './data-url.ts';

describe('decodeDataUrl', () => {
  it('splits a data URL into its type and its base64 payload', () => {
    expect(decodeDataUrl('data:image/jpeg;base64,/9j/AAAA')).toEqual({ mime: 'image/jpeg', base64: '/9j/AAAA' });
  });

  it('answers null for anything that is not a base64 data URL', () => {
    expect(decodeDataUrl('photos/a.jpg')).toBeNull();
    expect(decodeDataUrl('data:,plain')).toBeNull();
    expect(decodeDataUrl('')).toBeNull();
  });
});

describe('extensionFor', () => {
  it('names the file by what the bytes are', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('image/heic')).toBe('heic');
  });
});
