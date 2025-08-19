// Wails v3 runtime is provided by '@wailsio/runtime' at runtime and on the global `wails` object.
// To avoid strict type coupling during migration, we use dynamic access with fallbacks.

// Detect if running inside a Wails desktop environment
const hasRuntime =
  typeof window !== 'undefined' && typeof (window as any).runtime !== 'undefined';

export function isWailsEnvironment(): boolean {
  return hasRuntime;
}

export function LogInfo(message: string): void {
  console.log(message);
}

export function LogError(message: string): void {
  console.error(message);
}

export function EventsOn(event: string, callback: (...args: any[]) => void): void {
  const w = (window as any);
  if (w && w.wails && w.wails.Events && w.wails.Events.On) {
    w.wails.Events.On(event, (ev: any) => callback(ev?.data ?? ev));
  }
}

export function EventsOff(event: string): void {
  const w = (window as any);
  if (w && w.wails && w.wails.Events && w.wails.Events.Off) {
    w.wails.Events.Off(event);
  }
}

export async function ClipboardGetText(): Promise<string> {
  const w = (window as any);
  if (w && w.wails && w.wails.Clipboard && w.wails.Clipboard.Text) {
    return w.wails.Clipboard.Text();
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
  const w = (window as any);
  if (w && w.wails && w.wails.Clipboard && w.wails.Clipboard.SetText) {
    await w.wails.Clipboard.SetText(text);
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
