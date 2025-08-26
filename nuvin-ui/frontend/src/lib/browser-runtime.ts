import { Events, Clipboard } from '@wailsio/runtime';

export function isWailsEnvironment(): boolean {
  return Boolean((window as any).wails);
}

export function LogInfo(message: string): void {
  console.log(message);
}

export function LogError(message: string): void {
  console.error(message);
}

export function EventsOn(event: string, callback: (...args: any[]) => void): void {
  if (Events.On) {
    Events.On(event, (ev: any) => callback(ev?.data ?? ev));
  }
}

export function EventsOff(event: string): void {
  if (Events.Off) {
    Events.Off(event);
  }
}

export async function ClipboardGetText(): Promise<string> {
  if (isWailsEnvironment()) {
    return Clipboard.Text();
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      console.warn('Failed to read clipboard contents', {
        hasRuntime: isWailsEnvironment(),
      });
      return '';
    }
  }
  return '';
}

export async function ClipboardSetText(text: string): Promise<void> {
  if (isWailsEnvironment()) {
    await Clipboard.SetText(text);
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
