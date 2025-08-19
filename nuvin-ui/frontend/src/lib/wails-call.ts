export async function callApp<T = any>(method: string, ...args: any[]): Promise<T> {
  const w = (window as any);
  if (!w || !w.wails || !w.wails.Call || !w.wails.Call.Call) {
    throw new Error('Wails v3 runtime not ready');
  }
  return w.wails.Call.Call({ methodName: `App.${method}`, args });
}

