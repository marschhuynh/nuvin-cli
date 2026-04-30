import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export function copyTextToClipboard(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const os = platform();
    let cmd: string;
    let args: string[];

    if (os === 'darwin') {
      cmd = 'pbcopy';
      args = [];
    } else if (os === 'linux') {
      cmd = 'xclip';
      args = ['-selection', 'clipboard'];
    } else if (os === 'win32') {
      cmd = 'clip';
      args = [];
    } else {
      resolve(false);
      return;
    }

    const proc = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'ignore'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    proc.stdin.end(text);
  });
}
