import {
  LogInfo as WailsLogInfo,
  LogError as WailsLogError,
  EventsOn as WailsEventsOn,
  EventsOff as WailsEventsOff,
  ClipboardGetText as WailsClipboardGetText,
  ClipboardSetText as WailsClipboardSetText,
} from '@wails/runtime';

// Detect if running inside a Wails desktop environment
const hasRuntime =
  typeof window !== 'undefined' && typeof (window as any).runtime !== 'undefined';

export function isWailsEnvironment(): boolean {
  return hasRuntime;
}

export function LogInfo(message: string): void {
  if (hasRuntime) {
    WailsLogInfo(message);
  } else {
    console.log(message);
  }
}

export function LogError(message: string): void {
  if (hasRuntime) {
    WailsLogError(message);
  } else {
    console.error(message);
  }
}

export function EventsOn(event: string, callback: (...args: any[]) => void): void {
  if (hasRuntime) {
    WailsEventsOn(event, callback);
  }
}

export function EventsOff(event: string): void {
  if (hasRuntime) {
    WailsEventsOff(event);
  }
}

export async function ClipboardGetText(): Promise<string> {
  if (hasRuntime) {
    return WailsClipboardGetText();
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      console.warn('Failed to read clipboard contents', { hasRuntime });
      return '';
    }
  }
  return '';
}

export async function ClipboardSetText(text: string): Promise<void> {
  if (hasRuntime) {
    await WailsClipboardSetText(text);
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
