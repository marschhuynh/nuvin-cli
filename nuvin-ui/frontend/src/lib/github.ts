import { FetchGithubCopilotKey } from '../../wailsjs/go/main/App';

export async function fetchGithubCopilotKey(): Promise<string | null> {
  try {
    // Check if Wails runtime is available
    if (!window.go || !window.go.main || !window.go.main.App) {
      console.error('Wails runtime is not available');
      return null;
    }

    const token = await FetchGithubCopilotKey();
    return token || null;
  } catch (error) {
    console.error('Failed to fetch GitHub Copilot key:', error);
    return null;
  }
}

// Types for window.go are declared in src/types/wails-fs.d.ts
