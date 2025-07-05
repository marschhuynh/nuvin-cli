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

// Add type declaration for window.go
declare global {
  interface Window {
    go: {
      main: {
        App: {
          FetchGithubCopilotKey: () => Promise<string>;
          Greet: (name: string) => Promise<string>;
        };
      };
    };
  }
}
