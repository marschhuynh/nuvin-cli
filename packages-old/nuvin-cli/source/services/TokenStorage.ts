import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as os from 'node:os';

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface TokenStorage {
  get(key: string): Promise<StoredTokens | null>;
  set(key: string, tokens: StoredTokens): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

interface EncryptedData {
  iv: string;
  data: string;
  tag: string;
}

interface TokenStore {
  version: number;
  tokens: Record<string, EncryptedData>;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const STORE_VERSION = 1;

function deriveKey(machineId: string): Buffer {
  return crypto.pbkdf2Sync(machineId, 'nuvin-mcp-token-salt', 100000, KEY_LENGTH, 'sha256');
}

function getMachineId(): string {
  const factors = [os.hostname(), os.userInfo().username, os.homedir(), os.platform(), os.arch()];

  return crypto.createHash('sha256').update(factors.join('|')).digest('hex');
}

function encrypt(data: string, key: Buffer): EncryptedData {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    data: encrypted,
    tag: tag.toString('base64'),
  };
}

function decrypt(encrypted: EncryptedData, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'base64');
  const tag = Buffer.from(encrypted.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted.data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export class FileTokenStorage implements TokenStorage {
  private storePath: string;
  private key: Buffer;
  private store: TokenStore | null = null;

  constructor(configDir?: string) {
    const baseDir = configDir || path.join(os.homedir(), '.nuvin');
    this.storePath = path.join(baseDir, '.tokens.json');
    this.key = deriveKey(getMachineId());
  }

  private async loadStore(): Promise<TokenStore> {
    if (this.store) {
      return this.store;
    }

    try {
      if (fs.existsSync(this.storePath)) {
        const content = await fs.promises.readFile(this.storePath, 'utf8');
        this.store = JSON.parse(content) as TokenStore;

        if (this.store.version !== STORE_VERSION) {
          this.store = { version: STORE_VERSION, tokens: {} };
        }
      } else {
        this.store = { version: STORE_VERSION, tokens: {} };
      }
    } catch {
      this.store = { version: STORE_VERSION, tokens: {} };
    }

    return this.store;
  }

  private async saveStore(): Promise<void> {
    if (!this.store) return;

    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    await fs.promises.writeFile(this.storePath, JSON.stringify(this.store, null, 2), {
      mode: 0o600,
    });
  }

  async get(key: string): Promise<StoredTokens | null> {
    const store = await this.loadStore();
    const encrypted = store.tokens[key];

    if (!encrypted) {
      return null;
    }

    try {
      const decrypted = decrypt(encrypted, this.key);
      return JSON.parse(decrypted) as StoredTokens;
    } catch {
      delete store.tokens[key];
      await this.saveStore();
      return null;
    }
  }

  async set(key: string, tokens: StoredTokens): Promise<void> {
    const store = await this.loadStore();
    const encrypted = encrypt(JSON.stringify(tokens), this.key);
    store.tokens[key] = encrypted;
    await this.saveStore();
  }

  async delete(key: string): Promise<void> {
    const store = await this.loadStore();
    delete store.tokens[key];
    await this.saveStore();
  }

  async list(): Promise<string[]> {
    const store = await this.loadStore();
    return Object.keys(store.tokens);
  }

  async clear(): Promise<void> {
    this.store = { version: STORE_VERSION, tokens: {} };
    await this.saveStore();
  }
}

export class MemoryTokenStorage implements TokenStorage {
  private tokens: Map<string, StoredTokens> = new Map();

  async get(key: string): Promise<StoredTokens | null> {
    return this.tokens.get(key) || null;
  }

  async set(key: string, tokens: StoredTokens): Promise<void> {
    this.tokens.set(key, tokens);
  }

  async delete(key: string): Promise<void> {
    this.tokens.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.tokens.keys());
  }

  clear(): void {
    this.tokens.clear();
  }
}

let defaultStorage: TokenStorage | null = null;

export function getDefaultTokenStorage(): TokenStorage {
  if (!defaultStorage) {
    defaultStorage = new FileTokenStorage();
  }
  return defaultStorage;
}

export function setDefaultTokenStorage(storage: TokenStorage): void {
  defaultStorage = storage;
}
