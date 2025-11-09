import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from './SelectInput/index.js';
import { eventBus } from '@/services/EventBus.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { MCPServerInfo } from '@/services/MCPServerManager.js';
import { AppModal } from './AppModal.js';
import { MCPServerItem } from './MCPServerItem.js';
import { MCPToolItem } from './MCPToolItem.js';
import { HelpText } from './HelpText.js';

interface MCPModalProps {
  visible: boolean;
  servers: MCPServerInfo[];
  allowedToolsConfig?: Record<string, Record<string, boolean>>;
  onClose: () => void;
}

export const MCPModal: React.FC<MCPModalProps> = ({ visible, servers, allowedToolsConfig = {}, onClose }) => {
  const { theme } = useTheme();
  const [selectedServer, setSelectedServer] = useState<MCPServerInfo | null>(null);
  const [focusPanel, setFocusPanel] = useState<'servers' | 'tools'>('servers');
  const [localAllowedTools, setLocalAllowedTools] =
    useState<Record<string, Record<string, boolean>>>(allowedToolsConfig);
  const inputActiveRef = useRef(false);

  // Sync local state with prop changes
  useEffect(() => {
    setLocalAllowedTools(allowedToolsConfig);
  }, [allowedToolsConfig]);

  // Initialize selected server
  useEffect(() => {
    if (servers.length > 0 && !selectedServer) {
      const firstServer = servers[0];
      if (firstServer) {
        setSelectedServer(firstServer);
      }
    } else if (servers.length === 0) {
      setSelectedServer(null);
      setFocusPanel('servers');
    } else if (selectedServer && !servers.find((s) => s.id === selectedServer.id)) {
      const firstServer = servers[0];
      if (firstServer) {
        setSelectedServer(firstServer);
      }
    }
  }, [servers, selectedServer]);

  useEffect(() => {
    if (!visible) return;

    const handleToolPermissionChanged = (data: { serverId: string; toolName: string; allowed: boolean }) => {
      // Update local state when permission changes
      setLocalAllowedTools((prev) => ({
        ...prev,
        [data.serverId]: {
          ...(prev[data.serverId] || {}),
          [data.toolName]: data.allowed,
        },
      }));
    };

    eventBus.on('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);

    return () => {
      eventBus.off('ui:mcp:toolPermissionChanged', handleToolPermissionChanged);
    };
  }, [visible]);

  // Handle keyboard input for panel switching and special actions
  useInput(
    (input, key) => {
      if (!visible) return;

      // Prevent input handling when SelectInput is active
      if (inputActiveRef.current) {
        inputActiveRef.current = false;
        return;
      }

      // ESC - Close or go back
      if (key.escape) {
        if (focusPanel === 'tools' && servers.length > 0) {
          setFocusPanel('servers');
        } else {
          onClose();
        }
        return;
      }

      // Tab - Switch panels
      if (key.tab) {
        if (servers.length > 0 && !selectedServer?.error) {
          setFocusPanel((prev) => (prev === 'servers' ? 'tools' : 'servers'));
        }
        return;
      }

      // Arrow keys for panel switching
      if (key.leftArrow) {
        if (focusPanel === 'tools' && servers.length > 0) {
          setFocusPanel('servers');
        }
        return;
      }

      if (key.rightArrow) {
        if (focusPanel === 'servers' && servers.length > 0 && selectedServer) {
          setFocusPanel('tools');
        }
        return;
      }

      // A - Enable all tools for selected server
      if (input === 'a' || input === 'A') {
        if (selectedServer && selectedServer.status === 'connected') {
          const newAllowedTools = { ...localAllowedTools };
          if (!newAllowedTools[selectedServer.id]) {
            newAllowedTools[selectedServer.id] = {};
          }

          selectedServer.exposedTools.forEach((toolName) => {
            newAllowedTools[selectedServer.id][toolName] = true;
          });

          setLocalAllowedTools(newAllowedTools);

          eventBus.emit('ui:mcp:batchToolPermissionChanged', {
            serverId: selectedServer.id,
            config: newAllowedTools,
          });
        }
        return;
      }

      // D - Disable all tools for selected server
      if (input === 'd' || input === 'D') {
        if (selectedServer && selectedServer.status === 'connected') {
          const newAllowedTools = { ...localAllowedTools };
          if (!newAllowedTools[selectedServer.id]) {
            newAllowedTools[selectedServer.id] = {};
          }

          selectedServer.exposedTools.forEach((toolName) => {
            newAllowedTools[selectedServer.id][toolName] = false;
          });

          setLocalAllowedTools(newAllowedTools);

          eventBus.emit('ui:mcp:batchToolPermissionChanged', {
            serverId: selectedServer.id,
            config: newAllowedTools,
          });
        }
        return;
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const currentTools = selectedServer?.exposedTools || [];

  const getServerAllowedCount = (server: MCPServerInfo) => {
    const serverConfig = localAllowedTools[server.id] || {};
    return server.exposedTools.filter((tool) => serverConfig[tool] !== false).length;
  };

  const isToolAllowed = (serverId: string, toolName: string) => {
    const serverConfig = localAllowedTools[serverId] || {};
    return serverConfig[toolName] !== false;
  };

  const handleServerHighlight = (item: { value: MCPServerInfo }) => {
    setSelectedServer(item.value);
  };

  const handleServerSelect = (item: { value: MCPServerInfo }) => {
    inputActiveRef.current = true;
    if (item.value.status === 'connected') {
      setFocusPanel('tools');
    }
  };

  const handleToolSelect = (item: { value: string }) => {
    inputActiveRef.current = true;
    if (!selectedServer) return;

    const toolName = item.value;
    const newAllowedTools = { ...localAllowedTools };
    if (!newAllowedTools[selectedServer.id]) {
      newAllowedTools[selectedServer.id] = {};
    }

    const currentValue = newAllowedTools[selectedServer.id][toolName];
    newAllowedTools[selectedServer.id][toolName] = currentValue === false;

    setLocalAllowedTools(newAllowedTools);

    eventBus.emit('ui:mcp:toolPermissionChanged', {
      serverId: selectedServer.id,
      toolName: toolName,
      allowed: newAllowedTools[selectedServer.id][toolName],
    });
  };

  return (
    <AppModal
      visible={visible}
      title="MCP Server Configuration"
      titleColor={theme.colors.primary}
      type="default"
      onClose={undefined}
      closeOnEscape={false}
      paddingX={2}
      paddingY={1}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text color={theme.history.help} dimColor>
          ↑↓ navigate • ←→/Tab switch panel • Space toggle • Enter select • ESC{' '}
          {focusPanel === 'tools' ? 'back' : 'exit'}
        </Text>
        <Box>
          <HelpText
            segments={[
              { text: 'A', highlight: true },
              { text: ' enable all • ' },
              { text: 'D', highlight: true },
              { text: ' disable all' },
            ]}
          />
        </Box>
      </Box>

      {servers.length === 0 ? (
        <Box marginTop={1}>
          <Text color={theme.history.help}>No MCP servers configured or connected</Text>
        </Box>
      ) : (
        <Box flexDirection="row" marginTop={1}>
          {/* Left Panel - Servers */}
          <Box flexDirection="column" width="40%" marginRight={2}>
            <Box marginBottom={1}>
              <Text
                color={focusPanel === 'servers' ? theme.colors.accent : theme.history.unselected}
                bold={focusPanel === 'servers'}
              >
                Servers ({servers.length})
              </Text>
            </Box>

            <SelectInput<MCPServerInfo>
              items={servers.map((server) => ({
                key: server.id,
                label: server.id,
                value: server,
              }))}
              itemComponent={(props: { isSelected?: boolean; label: string; value: MCPServerInfo }) => {
                const server = props.value;
                return (
                  <MCPServerItem
                    item={server}
                    isSelected={props.isSelected}
                    allowedCount={getServerAllowedCount(server)}
                    totalCount={server.exposedTools.length}
                  />
                );
              }}
              onSelect={handleServerSelect}
              onHighlight={handleServerHighlight}
              focus={focusPanel === 'servers'}
            />
          </Box>

          {/* Right Panel - Tools */}
          <Box flexDirection="column" flexGrow={1}>
            <Box marginBottom={1}>
              <Text
                color={focusPanel === 'tools' ? theme.colors.accent : theme.history.unselected}
                bold={focusPanel === 'tools'}
              >
                Tools{' '}
                {selectedServer
                  ? `(${getServerAllowedCount(selectedServer)}/${selectedServer.exposedTools.length})`
                  : ''}
              </Text>
            </Box>

            {!selectedServer ? (
              <Text color={theme.history.help}>Select a server to view tools</Text>
            ) : selectedServer.status === 'failed' ? (
              <Box flexDirection="column">
                <Text color="red">Server failed to initialize</Text>
                <Text color={theme.history.help} dimColor>
                  Error: {selectedServer.error || 'Unknown error'}
                </Text>
              </Box>
            ) : currentTools.length === 0 ? (
              <Text color={theme.history.help}>No tools available for this server</Text>
            ) : (
              <SelectInput<string>
                limit={10}
                items={currentTools.map((toolName) => ({
                  key: toolName,
                  label: toolName,
                  value: toolName,
                }))}
                itemComponent={(props: { isSelected?: boolean; label: string; value: string }) => {
                  const toolName = props.value;
                  // Find the index of the current tool in the tools array (0-based)
                  const toolIndex = currentTools.indexOf(toolName);
                  // Add 1 to make it 1-based for better user experience
                  const displayIndex = toolIndex + 1;
                  return (
                    <MCPToolItem
                      item={toolName}
                      isSelected={props.isSelected}
                      allowed={isToolAllowed(selectedServer.id, toolName)}
                      index={displayIndex}
                    />
                  );
                }}
                onSelect={handleToolSelect}
                focus={focusPanel === 'tools'}
              />
            )}
          </Box>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.history.help} dimColor>
          Current: {focusPanel === 'servers' ? 'Servers panel' : 'Tools panel'}
          {selectedServer && ` | Server: ${selectedServer.id} | Prefix: ${selectedServer.prefix}`}
        </Text>
      </Box>
    </AppModal>
  );
};

export default MCPModal;
