import type { Clock } from './ports.js';

export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }

  iso(dateMs?: number): string {
    return new Date(dateMs ?? Date.now()).toISOString();
  }
}
