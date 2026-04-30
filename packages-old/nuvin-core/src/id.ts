import type { IdGenerator } from './ports.js';

export class SimpleId implements IdGenerator {
  uuid(): string {
    // RFC4122-ish v4 without crypto; good enough for demo
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
