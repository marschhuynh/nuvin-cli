import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { MemoryEntry, MemoryType } from '@nuvin/nuvin-core';

interface MemoryListProps {
  memories: MemoryEntry[];
  onMemorySelect: (index: number) => void;
  onView?: (id: string) => void;
  focus?: boolean;
}

const TYPE_ICONS: Record<MemoryType, string> = {
  semantic: 'S',
  episodic: 'E',
  procedural: 'P',
};

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export const MemoryList: React.FC<MemoryListProps> = ({
  memories,
  onMemorySelect,
  onView,
  focus = true,
}) => {
  const { theme } = useTheme();

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      memories.map((m) => ({
        label: m.content,
        value: m.id,
      })),
    [memories],
  );

  const renderMemoryItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const memory = memories.find((m) => m.id === item.value);
      if (!memory) return null;

      const icon = TYPE_ICONS[memory.type];
      const accentColor = theme.colors.accent;
      const scopeColor = memory.scope === 'global' ? theme.tokens.yellow : theme.tokens.cyan;

      return (
        <Box flexDirection="column">
          <Box>
            <Text>{icon} </Text>
            <Text color={isSelected ? accentColor : undefined}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? accentColor : theme.colors.text} bold={isSelected}>
              {isSelected ? memory.content : truncate(memory.content, 60)}
            </Text>
            <Text> </Text>
            <Text color={scopeColor} dimColor>
              [{memory.scope}]
            </Text>
          </Box>
          {isSelected && (
            <Box flexDirection="column">
              <Box
                marginLeft={4}
                borderStyle={'single'}
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                borderLeft
                borderDimColor
                paddingX={1}
              >
                <Text dimColor wrap="wrap">
                  <Text>type: </Text>
                  <Text color={theme.colors.text}>{memory.type}</Text>
                  <Text> • source: </Text>
                  <Text color={theme.colors.text}>{memory.source}</Text>
                  <Text> • accessed: </Text>
                  <Text color={theme.colors.text}>{memory.accessCount}×</Text>
                  <Text> • created: </Text>
                  <Text color={theme.colors.text}>{formatDate(memory.createdAt)}</Text>
                </Text>
              </Box>
              {memory.tags.length > 0 && (
                <Box marginLeft={4}>
                  <Text dimColor>└─ tags: {memory.tags.join(', ')}</Text>
                </Box>
              )}
            </Box>
          )}
        </Box>
      );
    },
    [memories, theme],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      onView?.(item.value);
    },
    [onView],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      onMemorySelect(index);
    },
    [onMemorySelect],
  );

  const typeCounts = useMemo(() => {
    const counts: Record<MemoryType, number> = { semantic: 0, episodic: 0, procedural: 0 };
    for (const m of memories) counts[m.type]++;
    return counts;
  }, [memories]);

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Memories ({memories.length})
        </Text>
        <Text dimColor>
          {' '}— Semantic:{typeCounts.semantic} Episodic:{typeCounts.episodic} Procedural:{typeCounts.procedural}
        </Text>
      </Box>

      <ComboBox
        items={comboBoxItems}
        placeholder="Search memories..."
        enableRotation={true}
        showItemCount={false}
        focus={focus}
        renderItem={renderMemoryItem}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
      />
    </Box>
  );
};
