export type MemoryType = 'semantic' | 'episodic' | 'procedural';
export type MemoryScope = 'global' | 'project';
export type MemorySource = 'extracted' | 'explicit' | 'imported';
export type MemoryStatus = 'active' | 'superseded' | 'deprecated';

export interface MemoryStatement {
  id: string;
  content: string;
  signature: string;
  key?: string;
  status: MemoryStatus;
  supersedes?: string[];
  contradicts?: string[];
  confidence?: number;
  evidence?: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
}

export interface MemoryEntry {
  id: string;
  topic: string;
  title?: string;
  content: string;
  version?: number;
  statements?: MemoryStatement[];
  type: MemoryType;
  scope: MemoryScope;
  tags: string[];
  keywords: string[];
  workspaceId?: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  source: MemorySource;
}

export type MemoryEntryInput = Omit<
  MemoryEntry,
  'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt' | 'topic' | 'keywords'
> &
  Partial<Pick<MemoryEntry, 'topic' | 'keywords' | 'title' | 'workspaceId'>>;

export interface MemorySearchOptions {
  type?: MemoryType;
  scope?: MemoryScope;
  tags?: string[];
  limit?: number;
}

export interface MemoryStorePort {
  add(entry: MemoryEntryInput): Promise<MemoryEntry>;
  update(id: string, updates: Partial<Pick<MemoryEntry, 'content' | 'tags'>>): Promise<MemoryEntry | null>;
  delete(id: string): Promise<boolean>;
  get(id: string): Promise<MemoryEntry | null>;
  search(options?: MemorySearchOptions): Promise<MemoryEntry[]>;
  getAll(): Promise<MemoryEntry[]>;
  recordAccess(id: string): Promise<void>;
  clear(scope?: MemoryScope): Promise<void>;
}
