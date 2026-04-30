import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execAsync = promisify(exec);

export interface ClipboardFile {
  data: Buffer;
  type?: string;
  name?: string;
}

export async function hasClipboardFiles(): Promise<boolean> {
  try {
    const os = platform();

    if (os === 'darwin') {
      // Check if clipboard contains image data - expanded format support
      const { stdout } = await execAsync('osascript -e "clipboard info"');
      return (
        stdout.includes('«class PNGf»') ||
        stdout.includes('«class TIFF»') ||
        stdout.includes('«class JPEG»') ||
        stdout.includes('«class GIFf»') ||
        stdout.includes('«class BMPf»') ||
        stdout.includes('«class HEIF»') ||
        stdout.includes('«class WEBP»')
      );
    } else if (os === 'linux') {
      const { stdout } = await execAsync('xclip -selection clipboard -t TARGETS -o 2>/dev/null || echo ""');
      return (
        stdout.includes('image/png') ||
        stdout.includes('image/jpeg') ||
        stdout.includes('image/gif') ||
        stdout.includes('image/bmp') ||
        stdout.includes('image/tiff') ||
        stdout.includes('image/webp')
      );
    } else if (os === 'win32') {
      try {
        // Check if clipboard contains image data
        const { stdout } = await execAsync(
          "powershell -command \"if ([System.Windows.Forms.Clipboard]::ContainsImage()) { 'true' } else { 'false' }\" 2>$null",
        );
        return stdout.trim() === 'true';
      } catch {
        return false;
      }
    }

    return false;
  } catch {
    return false;
  }
}

export async function getClipboardFiles(): Promise<ClipboardFile[]> {
  try {
    const os = platform();

    if (os === 'darwin') {
      return await getMacOSClipboardImage();
    } else if (os === 'linux') {
      return await getLinuxClipboardImage();
    } else if (os === 'win32') {
      return await getWindowsClipboardImage();
    }

    return [];
  } catch (error) {
    console.warn('Failed to get clipboard files:', error);
    return [];
  }
}

async function getMacOSClipboardImage(): Promise<ClipboardFile[]> {
  const formats = [
    { format: '«class PNGf»', extension: 'png', mimeType: 'image/png' },
    { format: '«class JPEG»', extension: 'jpg', mimeType: 'image/jpeg' },
    { format: '«class TIFF»', extension: 'tiff', mimeType: 'image/tiff' },
    { format: '«class GIFf»', extension: 'gif', mimeType: 'image/gif' },
    { format: '«class BMPf»', extension: 'bmp', mimeType: 'image/bmp' },
  ];

  for (const { format, extension, mimeType } of formats) {
    try {
      const tempPath = join(tmpdir(), `clipboard-${Date.now()}.${extension}`);

      await execAsync(`osascript -e "
        set imageData to the clipboard as ${format}
        set fileRef to open for access POSIX file \\"${tempPath}\\" with write permission
        write imageData to fileRef
        close access fileRef
      "`);

      const buffer = readFileSync(tempPath);
      unlinkSync(tempPath);

      return [{ data: buffer, type: mimeType, name: `clipboard-image.${extension}` }];
    } catch {}
  }

  // Fallback to pngpaste if available
  try {
    const tempPath = join(tmpdir(), `clipboard-${Date.now()}.png`);
    await execAsync(`pngpaste "${tempPath}"`);
    const buffer = readFileSync(tempPath);
    unlinkSync(tempPath);
    return [{ data: buffer, type: 'image/png', name: 'clipboard-image.png' }];
  } catch {
    // No fallback worked
  }

  throw new Error('Unable to extract clipboard image on macOS');
}

async function getLinuxClipboardImage(): Promise<ClipboardFile[]> {
  const { stdout: targets } = await execAsync('xclip -selection clipboard -t TARGETS -o 2>/dev/null || echo ""');

  const formats = [
    { target: 'image/png', extension: 'png' },
    { target: 'image/jpeg', extension: 'jpg' },
    { target: 'image/gif', extension: 'gif' },
    { target: 'image/bmp', extension: 'bmp' },
    { target: 'image/tiff', extension: 'tiff' },
    { target: 'image/webp', extension: 'webp' },
  ];

  for (const { target, extension } of formats) {
    if (targets.includes(target)) {
      try {
        const { stdout: imageData } = await execAsync(`xclip -selection clipboard -t ${target} -o | base64`);
        const buffer = Buffer.from(imageData.trim(), 'base64');
        return [{ data: buffer, type: target, name: `clipboard-image.${extension}` }];
      } catch {}
    }
  }

  throw new Error('No supported image format found in clipboard');
}

async function getWindowsClipboardImage(): Promise<ClipboardFile[]> {
  const tempPath = join(tmpdir(), `clipboard-${Date.now()}.png`);

  try {
    await execAsync(`powershell -command "
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing

      if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
        $img = [System.Windows.Forms.Clipboard]::GetImage()
        if ($img -ne $null) {
          $img.Save('${tempPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
          $img.Dispose()
        }
      }
    "`);

    const buffer = readFileSync(tempPath);
    unlinkSync(tempPath);
    return [{ data: buffer, type: 'image/png', name: 'clipboard-image.png' }];
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {}
    throw error;
  }
}
