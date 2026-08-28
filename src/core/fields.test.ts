import { describe, expect, it } from 'vitest';
import { blankFor, fromText, toText } from './fields.ts';

describe('toText', () => {
  it('leaves a line as it is', () => {
    expect(toText('Airport staff wanted')).toBe('Airport staff wanted');
  });

  it('puts a list one item to a line', () => {
    expect(toText(['Cleaning', 'Security'])).toBe('Cleaning\nSecurity');
  });
});

describe('fromText', () => {
  it('reads a line back as a line', () => {
    expect(fromText('Airport staff wanted', 'line')).toBe('Airport staff wanted');
  });

  it('reads a list back a line at a time', () => {
    expect(fromText('Cleaning\nSecurity', 'list')).toEqual(['Cleaning', 'Security']);
  });

  it('drops blank lines from a list rather than rendering empty rows', () => {
    expect(fromText('Cleaning\n\n  \nSecurity\n', 'list')).toEqual(['Cleaning', 'Security']);
  });

  it('keeps the blank lines of a paragraph, which are the author paragraphing', () => {
    expect(fromText('First.\n\nSecond.', 'text')).toBe('First.\n\nSecond.');
  });

  it('round-trips every kind', () => {
    expect(fromText(toText(['a', 'b']), 'list')).toEqual(['a', 'b']);
    expect(fromText(toText('a'), 'line')).toBe('a');
  });
});

describe('blankFor', () => {
  it('answers in the shape the kind expects, so a missing phrase never changes a type', () => {
    expect(blankFor('line')).toBe('');
    expect(blankFor('text')).toBe('');
    expect(blankFor('list')).toEqual([]);
  });
});
