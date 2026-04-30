import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateBackoff, parseRetryAfterHeader } from '../transports/backoff.js';

describe('calculateBackoff', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should calculate exponential delay', () => {
    const delay0 = calculateBackoff(0, 1000, 60000, 2, 0);
    const delay1 = calculateBackoff(1, 1000, 60000, 2, 0);
    const delay2 = calculateBackoff(2, 1000, 60000, 2, 0);

    expect(delay0).toBe(1000);
    expect(delay1).toBe(2000);
    expect(delay2).toBe(4000);
  });

  it('should cap at maxDelayMs', () => {
    const delay = calculateBackoff(10, 1000, 5000, 2, 0);
    expect(delay).toBe(5000);
  });

  it('should apply jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delayWithNegativeJitter = calculateBackoff(0, 1000, 60000, 2, 0.2);
    expect(delayWithNegativeJitter).toBe(800);

    vi.spyOn(Math, 'random').mockReturnValue(1);
    const delayWithPositiveJitter = calculateBackoff(0, 1000, 60000, 2, 0.2);
    expect(delayWithPositiveJitter).toBe(1200);
  });

  it('should never return negative delay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = calculateBackoff(0, 100, 60000, 2, 1);
    expect(delay).toBeGreaterThanOrEqual(0);
  });
});

describe('parseRetryAfterHeader', () => {
  it('should return null for null header', () => {
    expect(parseRetryAfterHeader(null)).toBeNull();
  });

  it('should parse seconds', () => {
    expect(parseRetryAfterHeader('5')).toBe(5000);
    expect(parseRetryAfterHeader('30')).toBe(30000);
    expect(parseRetryAfterHeader('0')).toBe(0);
  });

  it('should parse HTTP date', () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const result = parseRetryAfterHeader(futureDate);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(11000);
  });

  it('should return null for past HTTP date', () => {
    const pastDate = new Date(Date.now() - 10000).toUTCString();
    expect(parseRetryAfterHeader(pastDate)).toBeNull();
  });

  it('should return null for invalid header', () => {
    expect(parseRetryAfterHeader('invalid')).toBeNull();
    expect(parseRetryAfterHeader('-1')).toBeNull();
  });
});
