import * as os from 'node:os';
import * as path from 'node:path';
import { FileLogger } from '@/utils/file-logger.js';

function isEnabled(flag: string | undefined): boolean {
  if (!flag) return false;
  const normalized = flag.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export const isTextInputDebugEnabled = isEnabled(process.env.NUVIN_TEXTINPUT_DEBUG);
export const isTextInputDebugVerbose = isEnabled(process.env.NUVIN_TEXTINPUT_DEBUG_VERBOSE);

const textInputLogger = isTextInputDebugEnabled
  ? new FileLogger({
      logDir: path.join(os.homedir(), '.nuvin', 'logs'),
      logFileName: process.env.NUVIN_TEXTINPUT_DEBUG_FILE || 'textinput-debug',
      minLevel: 'debug',
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 5,
      includeTimestamp: true,
      logToConsole: false,
    })
  : null;

let hasLoggedSessionHeader = false;
let eventSequence = 0;

export function logTextInputDebug(message: string, data?: unknown): void {
  if (!textInputLogger) {
    return;
  }

  if (!hasLoggedSessionHeader) {
    hasLoggedSessionHeader = true;
    textInputLogger.debug('TextInput debug session started', {
      pid: process.pid,
      term: process.env.TERM,
      termProgram: process.env.TERM_PROGRAM,
      logFile: textInputLogger.getLogFilePath(),
      verbose: isTextInputDebugVerbose,
    });
  }

  eventSequence += 1;
  const payload =
    data && typeof data === 'object'
      ? {
          seq: eventSequence,
          ...data,
        }
      : {
          seq: eventSequence,
          data,
        };

  textInputLogger.debug(message, payload);
}

export function getTextInputDebugLogPath(): string | null {
  return textInputLogger?.getLogFilePath() ?? null;
}
