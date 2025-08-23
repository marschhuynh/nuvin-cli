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
  const w = window as any;
  if (w?.wails?.Events?.On) {
    w.wails.Events.On(event, (ev: any) => callback(ev?.data ?? ev));
  }
}

export function EventsOff(event: string): void {
  const w = window as any;
  if (w?.wails?.Events?.Off) {
    w.wails.Events.Off(event);
  }
}

export async function ClipboardGetText(): Promise<string> {
  const w = window as any;
  if (w?.wails?.Clipboard?.Text) {
    return w.wails.Clipboard.Text();
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
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
  const w = window as any;
  if (w?.wails?.Clipboard?.SetText) {
    await w.wails.Clipboard.SetText(text);
  } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}
