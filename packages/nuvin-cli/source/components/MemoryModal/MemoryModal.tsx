import type React from 'react';
import { useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useMemoryModalState } from './useMemoryModalState.js';
import { MemoryList } from './MemoryList.js';
import type { MemoryEntry, MemoryType } from '@nuvin/nuvin-core';

const MODAL_HEIGHT = 30;

const TYPE_LABELS: Record<MemoryType, string> = {
  semantic: 'Semantic',
  episodic: 'Episodic',
  procedural: 'Procedural',
};

interface MemoryModalProps {
  visible: boolean;
  memories: MemoryEntry[];
  onClose: () => void;
  onDelete?: (id: string) => void;
}

type ActiveView = 'list' | 'detail';

export const MemoryModal: React.FC<MemoryModalProps> = ({
  visible,
  memories,
  onClose,
  onDelete,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();
  const state = useMemoryModalState(memories);

  const [activeView, setActiveView] = useState<ActiveView>('list');
  const [viewingMemory, setViewingMemory] = useState<MemoryEntry | null>(null);

  const handleView = useCallback(
    (id: string) => {
      const memory = memories.find((m) => m.id === id);
      if (memory) {
        setViewingMemory(memory);
        setActiveView('detail');
      }
    },
    [memories],
  );

  const handleBackToList = useCallback(() => {
    setActiveView('list');
    setViewingMemory(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      onDelete?.(id);
    },
    [onDelete],
  );

  // Handle delete key at list view level (ComboBox doesn't have onDelete)
  useInput(
    (_input, key) => {
      if (activeView === 'detail' && key.escape) {
        handleBackToList();
        return;
      }
      // 'd' key for delete on currently highlighted memory
      if (activeView === 'list' && _input === 'd') {
        const currentMemory = state.memories[state.selectedIndex];
        if (currentMemory) {
          handleDelete(currentMemory.id);
        }
      }
    },
    { isActive: visible },
  );

  if (!visible) return null;

  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  // Detail view
  if (activeView === 'detail' && viewingMemory) {
    const maxHeight = Math.max(5, rows - 12);

    return (
      <AppModal
        visible={true}
        title={`Memory: ${TYPE_LABELS[viewingMemory.type]}`}
        onClose={handleBackToList}
        closeOnEscape={true}
        footer={
          <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
            <HelpText
              segments={[
                { text: 'j/k', highlight: true },
                { text: ' scroll • ' },
                { text: 'ESC', highlight: true },
                { text: ' back' },
              ]}
            />
          </Box>
        }
        height="100%"
      >
        <Box flexDirection="column" flexGrow={1}>
          <Box marginBottom={1} flexDirection="column">
            <Text>{viewingMemory.content}</Text>
          </Box>
          <AutoScrollBox
            maxHeight={maxHeight}
            showScrollbar
            focus={true}
            enableKeyboardScroll={true}
          >
            <Box flexDirection="column">
              <Text dimColor>───────────────────────</Text>
              <Text dimColor>
                Type: <Text color={theme.colors.text}>{viewingMemory.type}</Text>
              </Text>
              <Text dimColor>
                Scope:{' '}
                <Text
                  color={
                    viewingMemory.scope === 'global' ? theme.tokens.yellow : theme.tokens.cyan
                  }
                >
                  {viewingMemory.scope}
                </Text>
              </Text>
              <Text dimColor>
                Source: <Text color={theme.colors.text}>{viewingMemory.source}</Text>
              </Text>
              <Text dimColor>
                Access count: <Text color={theme.colors.text}>{viewingMemory.accessCount}</Text>
              </Text>
              <Text dimColor>
                Created:{' '}
                <Text color={theme.colors.text}>
                  {new Date(viewingMemory.createdAt).toLocaleString()}
                </Text>
              </Text>
              <Text dimColor>
                Updated:{' '}
                <Text color={theme.colors.text}>
                  {new Date(viewingMemory.updatedAt).toLocaleString()}
                </Text>
              </Text>
              <Text dimColor>
                Last accessed:{' '}
                <Text color={theme.colors.text}>
                  {new Date(viewingMemory.lastAccessedAt).toLocaleString()}
                </Text>
              </Text>
              {viewingMemory.tags.length > 0 && (
                <Text dimColor>
                  Tags: <Text color={theme.colors.text}>{viewingMemory.tags.join(', ')}</Text>
                </Text>
              )}
              <Text dimColor>
                ID: <Text color={theme.colors.text}>{viewingMemory.id}</Text>
              </Text>
            </Box>
          </AutoScrollBox>
        </Box>
      </AppModal>
    );
  }

  // List view
  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓', highlight: true },
          { text: ' navigate • ' },
          { text: 'Enter', highlight: true },
          { text: ' view • ' },
          { text: 'd', highlight: true },
          { text: ' delete • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={visible}
      title="Memories"
      closeOnEscape={true}
      closeOnEnter={false}
      onClose={onClose}
      paddingX={1}
      paddingY={0}
      footer={footerContent}
      height={modalHeight}
    >
      {memories.length === 0 ? (
        <Box marginX={1} flexDirection="column">
          <Text color={theme.history.help}>No memories stored yet.</Text>
          <Text color={theme.colors.muted} dimColor>
            {'\n'}Memories are stored from:
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • Background extraction after each turn
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • memory_save tool usage
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • /memory add {'<content>'} command
          </Text>
        </Box>
      ) : (
        <MemoryList
          memories={state.memories}
          onMemorySelect={state.setSelectedIndex}
          onView={handleView}
          focus={true}
        />
      )}
    </AppModal>
  );
};
