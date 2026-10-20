import { describe, it, expect } from 'vitest';
import { autoAdvanceTarget } from '../auto-advance';

const pages = ['a', 'b', 'c'];

describe('autoAdvanceTarget', () => {
  it('goes back to the list by default', () => {
    expect(autoAdvanceTarget(pages, 1, 'list')).toBeNull();
  });

  it('opens the page the Next / Prev buttons would', () => {
    expect(autoAdvanceTarget(pages, 1, 'next')).toBe('c');
    expect(autoAdvanceTarget(pages, 1, 'previous')).toBe('a');
  });

  it('goes back to the list at either end', () => {
    expect(autoAdvanceTarget(pages, 2, 'next')).toBeNull();
    expect(autoAdvanceTarget(pages, 0, 'previous')).toBeNull();
    expect(autoAdvanceTarget(['a'], 0, 'next')).toBeNull();
  });

  it('goes back to the list when the message is not one of the pages', () => {
    expect(autoAdvanceTarget(pages, -1, 'next')).toBeNull();
    expect(autoAdvanceTarget(pages, 3, 'previous')).toBeNull();
  });
});
