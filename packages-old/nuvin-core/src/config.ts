// MCP configuration is now handled in nuvin-cli config system
// These types are kept for backward compatibility but are deprecated

/**
 * @deprecated Use MCPServerConfig from nuvin-cli/config/types.ts instead
 */
export type MCPServerConfig = {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
  url?: string;
  headers?: Record<string, string>;
  prefix?: string;
  timeoutMs?: number;
  enabled?: boolean;
};

/**
 * @deprecated MCP config is now part of main CLI config under mcp.servers
 */
export type MCPConfig = {
  mcpServers: Record<string, MCPServerConfig>;
};
