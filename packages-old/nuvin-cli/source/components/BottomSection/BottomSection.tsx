import { forwardRef } from 'react';
import { Box } from 'ink';
import { InputArea, type InputAreaHandle } from '../InputArea.js';
import { Footer } from '../Footer.js';
import type { MemoryPort, Message } from '@nuvin/nuvin-core';
import type { MetricsSnapshot } from '../../services/SessionMetricsService.js';

type BottomSectionProps = {
  busy: boolean;
  commandItems: Array<{ label: string; value: string }>;
  vimModeEnabled: boolean;
  memory?: MemoryPort<Message> | null;

  footerStatus: string;
  footerMetrics?: MetricsSnapshot;
  toolApprovalMode?: boolean;
  vimMode?: 'insert' | 'normal';
  workingDirectory?: string;

  onInputChanged?: (value: string) => void;
  onInputSubmit?: (value: string) => Promise<void>;
  onVimModeToggle?: () => void;
  onVimModeChanged?: (mode: 'insert' | 'normal') => void;
};

export const BottomSection = forwardRef<InputAreaHandle, BottomSectionProps>(function BottomSection(
  {
    busy,
    commandItems,
    vimModeEnabled,
    memory,

    footerStatus,
    footerMetrics,
    toolApprovalMode,
    vimMode,
    workingDirectory,

    onInputChanged,
    onInputSubmit,
    onVimModeToggle,
    onVimModeChanged,
  },
  ref,
) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <InputArea
        ref={ref}
        busy={busy}
        messageQueueLength={0}
        commandItems={commandItems}
        vimModeEnabled={vimModeEnabled}
        memory={memory}
        onInputChanged={onInputChanged}
        onInputSubmit={onInputSubmit}
        onVimModeToggle={onVimModeToggle}
        onVimModeChanged={onVimModeChanged}
      />
      <Footer
        status={footerStatus}
        metrics={footerMetrics}
        toolApprovalMode={toolApprovalMode}
        vimModeEnabled={vimModeEnabled}
        vimMode={vimMode}
        workingDirectory={workingDirectory}
      />
    </Box>
  );
});
