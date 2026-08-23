import { describe, it, expect } from 'vitest';
import { fillPercent, cellColor } from '../src/ui/cells';

describe('cells helpers', () => {
  it('fillPercent maps voltage into the [min,max] window', () => {
    expect(fillPercent(2500, 2500, 4300)).toBe(0);
    expect(fillPercent(4300, 2500, 4300)).toBe(100);
    expect(fillPercent(3400, 2500, 4300)).toBeCloseTo(50, 0);
  });

  it('fillPercent clamps out-of-range values', () => {
    expect(fillPercent(2000, 2500, 4300)).toBe(0);
    expect(fillPercent(5000, 2500, 4300)).toBe(100);
  });

  it('fillPercent is safe when the window is degenerate', () => {
    expect(fillPercent(3000, 3000, 3000)).toBe(0);
  });

  it('cellColor is a green/yellow/red traffic light by charge level', () => {
    expect(cellColor(4200, 2500, 4300)).toBe('green');   // ~94%
    expect(cellColor(3400, 2500, 4300)).toBe('yellow');  // ~50%
    expect(cellColor(2900, 2500, 4300)).toBe('red');     // ~22%
    expect(cellColor(0, 2500, 4300)).toBe('red');        // missing
  });
});
