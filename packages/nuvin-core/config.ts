import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type MCPServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // Optional HTTP transport support
  transport?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  // Optional tool name prefix override (defaults to mcp_<serverId>_)
  prefix?: string;
  // Optional timeout for MCP operations in milliseconds (default: 30000)
  timeoutMs?: number;
};

export type MCPConfig = {
  mcpServers: Record<string, MCPServerConfig>;
};

export async function loadMCPConfig(filePath: string = '.nuvin_mcp.json'): Promise<MCPConfig | null> {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const raw = await fs.promises.readFile(resolvedPath, 'utf-8');
    if (!raw.trim()) {
      return null;
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    let data: unknown;

    if (ext === '.yaml' || ext === '.yml') {
      data = parseYaml(raw);
    } else {
      data = JSON.parse(raw);
    }

    return normalizeMCPConfig(data);
  } catch (error) {
    console.warn(`Failed to load MCP config from ${filePath}:`, error);
    return null;
  }
}

function normalizeMCPConfig(raw: unknown): MCPConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const asRecord = raw as Record<string, unknown>;

  if (isValidConfig(asRecord)) {
    const servers = asRecord.mcpServers;
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      return { mcpServers: servers as MCPConfig['mcpServers'] };
    }
  }

  if ('config' in asRecord && asRecord.config && typeof asRecord.config === 'object') {
    const nested = asRecord.config as Record<string, unknown>;
    if (isValidConfig(nested)) {
      const servers = nested.mcpServers;
      if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
        return { mcpServers: servers as MCPConfig['mcpServers'] };
      }
    }
  }

  return null;
}

function isValidConfig(value: Record<string, unknown>): value is MCPConfig {
  if (!('mcpServers' in value)) {
    return false;
  }

  const servers = value.mcpServers;
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return false;
  }

  for (const server of Object.values(servers)) {
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      return false;
    }
  }

  return true;
}
