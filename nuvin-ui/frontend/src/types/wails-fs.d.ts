// Augment Wails window.go typings for FS bridge
export {}; // ensure this file is treated as a module

declare global {
  interface Window {
    go?: {
      main?: {
        App?: {
          // FS methods
          ReadFile: (path: string) => Promise<string>;
          WriteFile: (req: { path: string; content: string }) => Promise<void>;
          ListDir: (dir: string) => Promise<Array<{
            path: string;
            name: string;
            isDir: boolean;
            size: number;
            modTime: string;
          }>>;
          MkdirAll: (dir: string) => Promise<void>;
          Remove: (path: string, recursive: boolean) => Promise<void>;
          Rename: (oldPath: string, newPath: string) => Promise<void>;
          PathExists: (path: string) => Promise<boolean>;

          // Existing app methods used elsewhere
          FetchGithubCopilotKey: () => Promise<string>;
          Greet: (name: string) => Promise<string>;
          StartMCPServer: (request: any) => Promise<any>;
          StopMCPServer: (serverId: string) => Promise<any>;
          StopAllMCPServers: () => Promise<any>;
          SendMCPMessage: (serverId: string, message: any) => Promise<any>;
          GetMCPServerStatus: () => Promise<Record<string, string>>;
        };
      };
    };
  }
}
