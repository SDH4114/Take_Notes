import { describe, expect, it } from 'vitest';
import { newId } from '@/src/core/util';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  it('returns a UUID v4', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('works without crypto.randomUUID (insecure context, e.g. content script on http://)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    try {
      expect(typeof crypto.randomUUID).toBe('undefined');
      const ids = new Set(Array.from({ length: 50 }, () => newId()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true });
    }
  });
});
