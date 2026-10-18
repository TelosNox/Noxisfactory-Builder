import { describe, expect, it } from 'vitest';
import { Parser } from '@etothepii/satisfactory-file-parser';

describe('blueprint parser', () => {
  it('is importable', () => {
    expect(typeof Parser.ParseBlueprintFiles).toBe('function');
    expect(typeof Parser.WriteBlueprintFiles).toBe('function');
  });
});
