import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface FileLoggerOptions {
    /**
     * Directory where log files will be stored
     * @default ~/.nuvin-cli/logs
     */
    logDir?: string;

    /**
     * Base name for the log file (without extension)
     * @default 'nuvin'
     */
    logFileName?: string;

    /**
     * Minimum log level to write
     * @default 'info'
     */
    minLevel?: LogLevel;

    /**
     * Maximum size of a single log file in bytes before rotation
     * @default 5242880 (5MB)
     */
    maxFileSize?: number;

    /**
     * Maximum number of rotated log files to keep
     * @default 3
     */
    maxFiles?: number;

    /**
     * Whether to include timestamps in log entries
     * @default true
     */
    includeTimestamp?: boolean;

    /**
     * Whether to also log to console
     * @default false
     */
    logToConsole?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

export class FileLogger {
    private logDir: string;
    private logFilePath: string;
    private minLevel: LogLevel;
    private maxFileSize: number;
    private maxFiles: number;
    private includeTimestamp: boolean;
    private logToConsole: boolean;
    private writeStream: fs.WriteStream | null = null;

    constructor(options: FileLoggerOptions = {}) {
        this.logDir = options.logDir || path.join(os.homedir(), '.nuvin-cli', 'logs');
        const fileName = options.logFileName || 'nuvin';
        this.logFilePath = path.join(this.logDir, `${fileName}.log`);
        this.minLevel = options.minLevel || 'info';
        this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB
        this.maxFiles = options.maxFiles || 3;
        this.includeTimestamp = options.includeTimestamp ?? true;
        this.logToConsole = options.logToConsole ?? false;

        this.ensureLogDirectory();
    }

    /**
     * Ensure the log directory exists
     */
    private ensureLogDirectory(): void {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
        } catch (error) {
            console.error(`Failed to create log directory at ${this.logDir}:`, error);
        }
    }

    /**
     * Get or create the write stream
     */
    private getWriteStream(): fs.WriteStream {
        if (!this.writeStream || this.writeStream.destroyed) {
            this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'w' });
        }
        return this.writeStream;
    }

    /**
     * Check if log rotation is needed and perform it
     */
    private checkAndRotate(): void {
        try {
            if (!fs.existsSync(this.logFilePath)) {
                return;
            }

            const stats = fs.statSync(this.logFilePath);
            if (stats.size >= this.maxFileSize) {
                this.rotateLogFiles();
            }
        } catch (error) {
            console.error('Error checking log file size:', error);
        }
    }

    /**
     * Rotate log files
     */
    private rotateLogFiles(): void {
        try {
            // Close current stream if open
            if (this.writeStream) {
                this.writeStream.end();
                this.writeStream = null;
            }

            const basePath = this.logFilePath;

            // Remove oldest log file if it exists
            const oldestLog = `${basePath}.${this.maxFiles}`;
            if (fs.existsSync(oldestLog)) {
                fs.unlinkSync(oldestLog);
            }

            // Rotate existing log files
            for (let i = this.maxFiles - 1; i >= 1; i--) {
                const currentLog = `${basePath}.${i}`;
                const nextLog = `${basePath}.${i + 1}`;
                if (fs.existsSync(currentLog)) {
                    fs.renameSync(currentLog, nextLog);
                }
            }

            // Rename current log to .1
            if (fs.existsSync(basePath)) {
                fs.renameSync(basePath, `${basePath}.1`);
            }
        } catch (error) {
            console.error('Error rotating log files:', error);
        }
    }

    /**
     * Format a log message
     */
    private formatMessage(level: LogLevel, message: string, data?: unknown): string {
        const parts: string[] = [];

        if (this.includeTimestamp) {
            parts.push(`[${new Date().toISOString()}]`);
        }

        parts.push(`[${level.toUpperCase()}]`);
        parts.push(message);

        if (data !== undefined) {
            try {
                parts.push(JSON.stringify(data, null, 2));
            } catch {
                parts.push(String(data));
            }
        }

        return parts.join(' ');
    }

    /**
     * Check if a log level should be logged
     */
    private shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
    }

    /**
     * Write a log entry
     */
    private write(level: LogLevel, message: string, data?: unknown): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(level, message, data);

        // Check if rotation is needed
        this.checkAndRotate();

        // Write to file
        try {
            const stream = this.getWriteStream();
            stream.write(`${formattedMessage}\n`);
        } catch (error) {
            console.error('Error writing to log file:', error);
        }

        // Optionally write to console
        if (this.logToConsole) {
            const consoleMethod = level === 'error' ? console.error :
                level === 'warn' ? console.warn :
                    console.log;
            consoleMethod(formattedMessage);
        }
    }

    /**
     * Log a debug message
     */
    debug(message: string, data?: unknown): void {
        this.write('debug', message, data);
    }

    /**
     * Log an info message
     */
    info(message: string, data?: unknown): void {
        this.write('info', message, data);
    }

    /**
     * Log a warning message
     */
    warn(message: string, data?: unknown): void {
        this.write('warn', message, data);
    }

    /**
     * Log an error message
     */
    error(message: string, data?: unknown): void {
        this.write('error', message, data);
    }

    /**
     * Close the logger and cleanup resources
     */
    close(): void {
        if (this.writeStream) {
            this.writeStream.end();
            this.writeStream = null;
        }
    }

    /**
     * Get the path to the current log file
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    /**
     * Clear all log files
     */
    clearLogs(): void {
        try {
            // Close current stream
            this.close();

            // Remove main log file
            if (fs.existsSync(this.logFilePath)) {
                fs.unlinkSync(this.logFilePath);
            }

            // Remove rotated log files
            for (let i = 1; i <= this.maxFiles; i++) {
                const rotatedLog = `${this.logFilePath}.${i}`;
                if (fs.existsSync(rotatedLog)) {
                    fs.unlinkSync(rotatedLog);
                }
            }
        } catch (error) {
            console.error('Error clearing log files:', error);
        }
    }
}

/**
 * Create a singleton logger instance
 */
let defaultLogger: FileLogger | null = null;

export function getDefaultLogger(options?: FileLoggerOptions): FileLogger {
    if (!defaultLogger) {
        defaultLogger = new FileLogger({
            logDir: '.',
            ...options
        });
    }
    return defaultLogger;
}

/**
 * Reset the default logger (useful for testing)
 */
export function resetDefaultLogger(): void {
    if (defaultLogger) {
        defaultLogger.close();
        defaultLogger = null;
    }
}
