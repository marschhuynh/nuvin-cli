import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import * as crypto from 'node:crypto';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { StatuslineSegment, StatuslineRow } from '@/config/types.js';
import { DEFAULT_STATUSLINE_ROWS } from '@/components/Footer.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_SEGMENTS: StatuslineSegment[] = [
  'model',
  'session',
  'thinking',
  'sudo',
  'tokens',
  'context',
  'cached',
  'requests',
  'tools',
  'cost',
  'lsp',
  'gitBranch',
  'keybindings',
];

const SEGMENT_LABELS: Record<StatuslineSegment, string> = {
  model: 'Provider:Model',
  session: 'Session ID',
  thinking: 'Thinking',
  sudo: 'SUDO',
  tokens: 'Tokens',
  context: 'Context %',
  cached: 'Cached',
  requests: 'Requests',
  tools: 'Tools',
  cost: 'Cost',
  lsp: 'LSP',
  gitBranch: 'Git branch',
  keybindings: 'Keybindings',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Rows = [StatuslineRow, StatuslineRow];

const getHidden = (rows: Rows): StatuslineSegment[] =>
  ALL_SEGMENTS.filter((s) => !rows[0].includes(s) && !rows[1].includes(s));

/** Clamp index so it never points past the end of an array. */
const clamp = (idx: number, length: number): number =>
  length === 0 ? 0 : Math.min(idx, length - 1);

/** Swap adjacent elements; returns a new array (no mutation). */
const swapAt = <T,>(arr: T[], i: number, j: number): T[] => {
  if (i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

// ---------------------------------------------------------------------------
// Editor state shape
// ---------------------------------------------------------------------------

type Mode = 'rows' | 'hidden';

interface EditorState {
  rows: Rows;
  mode: Mode;
  activeRow: 0 | 1;
  activeIndex: number;
  hiddenIndex: number;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface RowEditorProps {
  label: string;
  row: StatuslineRow;
  isFocused: boolean;
  activeIndex: number;
  accentColor: string;
  dimColor: string;
}

const RowEditor: React.FC<RowEditorProps> = ({ label, row, isFocused, activeIndex, accentColor, dimColor }) => {
  return (
    <Box flexDirection="row" flexWrap="wrap">
      <Text color={dimColor}>{label}: </Text>
      {row.length === 0 ? (
        <Text dimColor italic>
          {'(empty)'}
        </Text>
      ) : (
        row.map((item, idx) => {
          const isSelected = isFocused && idx === activeIndex;
          const isSep = item === '|';

          if (isSep) {
            return (
              <Box key={`sep-${idx}`} marginRight={1}>
                {isSelected ? (
                  <Text color={accentColor} bold>
                    {'[|]'}
                  </Text>
                ) : (
                  <Text dimColor>{'|'}</Text>
                )}
              </Box>
            );
          }

          const seg = item as StatuslineSegment;
          return (
            <Box key={seg} marginRight={1}>
              {isSelected ? (
                <Text color={accentColor} bold>
                  {'['}
                  {SEGMENT_LABELS[seg]}
                  {']'}
                </Text>
              ) : (
                <Text>{SEGMENT_LABELS[seg]}</Text>
              )}
            </Box>
          );
        })
      )}
    </Box>
  );
};

interface HiddenListProps {
  segments: StatuslineSegment[];
  isFocused: boolean;
  focusIndex: number;
  accentColor: string;
  dimColor: string;
}

const HiddenList: React.FC<HiddenListProps> = ({ segments, isFocused, focusIndex, accentColor, dimColor }) => {
  if (segments.length === 0) {
    return (
      <Box flexDirection="row">
        <Text color={dimColor}>Hidden: </Text>
        <Text dimColor>{'(none)'}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" flexWrap="wrap">
      <Text color={dimColor}>Hidden: </Text>
      {segments.map((seg, idx) => {
        const isSelected = isFocused && idx === focusIndex;
        return (
          <Box key={seg} marginRight={1}>
            {isSelected ? (
              <Text color={accentColor} bold>
                {'['}
                {SEGMENT_LABELS[seg]}
                {']'}
              </Text>
            ) : (
              <Text dimColor>{SEGMENT_LABELS[seg]}</Text>
            )}
          </Box>
        );
      })}
      {isFocused && (
        <Text dimColor>{'  '}1: add→row1  2: add→row2  ←→: navigate  Tab: back</Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const StatuslineCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const accentColor = theme.colors.accent;
  const dimColor = theme.colors.textDim;

  const initialRows = useCallback((): Rows => {
    const saved = context.config.get<Rows>('ui.statusline.rows');
    if (!saved) {
      return [
        [...DEFAULT_STATUSLINE_ROWS[0]],
        [...DEFAULT_STATUSLINE_ROWS[1]],
      ];
    }
    // Strip any obsolete segment keys (keep '|' separators)
    return [
      saved[0].filter((s) => s === '|' || ALL_SEGMENTS.includes(s as StatuslineSegment)),
      saved[1].filter((s) => s === '|' || ALL_SEGMENTS.includes(s as StatuslineSegment)),
    ];
  }, [context.config]);

  const [state, setState] = useState<EditorState>(() => ({
    rows: initialRows(),
    mode: 'rows',
    activeRow: 0,
    activeIndex: 0,
    hiddenIndex: 0,
  }));

  // -------------------------------------------------------------------------
  // Save handler
  // -------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    try {
      await context.config.set('ui.statusline.rows', state.rows, 'global');
      context.eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'info' as const,
        content: 'Statusline layout saved.',
        metadata: { timestamp: new Date().toISOString() },
      });
    } catch (err) {
      context.eventBus.emit('ui:line', {
        id: crypto.randomUUID(),
        type: 'error' as const,
        content: `Failed to save statusline layout: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { timestamp: new Date().toISOString() },
      });
    }
    deactivate();
  }, [context, deactivate, state.rows]);

  // -------------------------------------------------------------------------
  // Keyboard handler
  // -------------------------------------------------------------------------

  useInput(
    (input, key) => {
      setState((prev) => {
        const { rows, mode, activeRow, activeIndex, hiddenIndex } = prev;

        // ── rows mode ──────────────────────────────────────────────────────
        if (mode === 'rows') {
          const row = rows[activeRow];

          // Navigate left within row (←)
          if (key.leftArrow) {
            if (row.length === 0) return prev;
            const next = activeIndex === 0 ? row.length - 1 : activeIndex - 1;
            return { ...prev, activeIndex: next };
          }

          // Navigate right within row (→)
          if (key.rightArrow) {
            if (row.length === 0) return prev;
            const next = activeIndex >= row.length - 1 ? 0 : activeIndex + 1;
            return { ...prev, activeIndex: next };
          }

          // Switch active row (↑ / ↓)
          if (key.upArrow || key.downArrow) {
            const nextRow: 0 | 1 = activeRow === 0 ? 1 : 0;
            return {
              ...prev,
              activeRow: nextRow,
              activeIndex: clamp(activeIndex, rows[nextRow].length),
            };
          }

          // Reorder: move focused item left ('u')
          if (input === 'u') {
            if (row.length === 0 || activeIndex === 0) return prev;
            const newRow = swapAt(row, activeIndex, activeIndex - 1);
            const newRows: Rows = [...rows] as Rows;
            newRows[activeRow] = newRow;
            return { ...prev, rows: newRows, activeIndex: activeIndex - 1 };
          }

          // Reorder: move focused item right ('d')
          if (input === 'd') {
            if (row.length === 0 || activeIndex >= row.length - 1) return prev;
            const newRow = swapAt(row, activeIndex, activeIndex + 1);
            const newRows: Rows = [...rows] as Rows;
            newRows[activeRow] = newRow;
            return { ...prev, rows: newRows, activeIndex: activeIndex + 1 };
          }

          // Remove focused item ('x') — separator '|' cannot be removed
          if (input === 'x') {
            if (row.length === 0) return prev;
            const focused = row[activeIndex];
            if (focused === '|') return prev; // separator is structural, not removeable
            const newRow = row.filter((_, i) => i !== activeIndex);
            const newRows: Rows = [...rows] as Rows;
            newRows[activeRow] = newRow;
            const nextIndex = clamp(activeIndex, newRow.length);
            return { ...prev, rows: newRows, activeIndex: nextIndex };
          }

          // Tab: switch to hidden mode if there are hidden segments
          if (key.tab) {
            const hidden = getHidden(rows);
            if (hidden.length > 0) {
              return { ...prev, mode: 'hidden', hiddenIndex: 0 };
            }
            return prev;
          }

          // 'r': reset to defaults
          if (input === 'r') {
            return {
              ...prev,
              rows: [[...DEFAULT_STATUSLINE_ROWS[0]], [...DEFAULT_STATUSLINE_ROWS[1]]],
              activeRow: 0,
              activeIndex: 0,
              mode: 'rows',
            };
          }

          if (key.return) return prev; // handled below
          if (key.escape) return prev; // handled below

          return prev;
        }

        // ── hidden mode ────────────────────────────────────────────────────
        if (mode === 'hidden') {
          const hidden = getHidden(rows);

          // Navigate left/right through hidden list
          if (key.leftArrow) {
            if (hidden.length === 0) return prev;
            const next = hiddenIndex === 0 ? hidden.length - 1 : hiddenIndex - 1;
            return { ...prev, hiddenIndex: next };
          }

          if (key.rightArrow) {
            if (hidden.length === 0) return prev;
            const next = hiddenIndex >= hidden.length - 1 ? 0 : hiddenIndex + 1;
            return { ...prev, hiddenIndex: next };
          }

          // '1': append focused hidden segment before the separator in row 0 (or at end)
          if (input === '1') {
            if (hidden.length === 0) return prev;
            const seg = hidden[hiddenIndex];
            const newRows: Rows = [[...rows[0], seg], [...rows[1]]];
            const newHidden = getHidden(newRows);
            return { ...prev, rows: newRows, hiddenIndex: clamp(hiddenIndex, newHidden.length) };
          }

          // '2': append focused hidden segment to row 1
          if (input === '2') {
            if (hidden.length === 0) return prev;
            const seg = hidden[hiddenIndex];
            const newRows: Rows = [[...rows[0]], [...rows[1], seg]];
            const newHidden = getHidden(newRows);
            return { ...prev, rows: newRows, hiddenIndex: clamp(hiddenIndex, newHidden.length) };
          }

          // Tab or Escape: switch back to rows mode
          if (key.tab || key.escape) {
            return { ...prev, mode: 'rows' };
          }

          return prev;
        }

        return prev;
      });

      // Async actions that cannot live inside setState
      if (state.mode === 'rows') {
        if (key.return) {
          void handleSave();
          return true;
        }
        if (key.escape) {
          deactivate();
          return true;
        }
      }

      return true;
    },
    { isActive: true },
  );

  // -------------------------------------------------------------------------
  // Derived values for render
  // -------------------------------------------------------------------------

  const hidden = getHidden(state.rows);

  const footer = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      {state.mode === 'rows' ? (
        <HelpText
          segments={[
            { text: '←→', highlight: true },
            { text: ' navigate  ' },
            { text: '↑↓', highlight: true },
            { text: ' switch row  ' },
            { text: 'u/d', highlight: true },
            { text: ' reorder  ' },
            { text: 'x', highlight: true },
            { text: ' hide  ' },
            { text: 'Tab', highlight: true },
            { text: ' hidden  ' },
            { text: 'r', highlight: true },
            { text: ' reset  ' },
            { text: 'Enter', highlight: true },
            { text: ' save  ' },
            { text: 'Esc', highlight: true },
            { text: ' cancel' },
          ]}
        />
      ) : (
        <HelpText
          segments={[
            { text: '←→', highlight: true },
            { text: ' navigate  ' },
            { text: '1', highlight: true },
            { text: ' add→row1  ' },
            { text: '2', highlight: true },
            { text: ' add→row2  ' },
            { text: 'Tab/Esc', highlight: true },
            { text: ' back' },
          ]}
        />
      )}
    </Box>
  );

  return (
    <AppModal
      visible={true}
      title="Statusline Layout"
      onClose={deactivate}
      closeOnEscape={false}
      closeOnEnter={false}
      footer={footer}
    >
      <Box flexDirection="column" gap={1}>
        <RowEditor
          label="Row 1"
          row={state.rows[0]}
          isFocused={state.mode === 'rows' && state.activeRow === 0}
          activeIndex={state.activeIndex}
          accentColor={accentColor}
          dimColor={dimColor}
        />
        <RowEditor
          label="Row 2"
          row={state.rows[1]}
          isFocused={state.mode === 'rows' && state.activeRow === 1}
          activeIndex={state.activeIndex}
          accentColor={accentColor}
          dimColor={dimColor}
        />
        <Box marginTop={1}>
          <HiddenList
            segments={hidden}
            isFocused={state.mode === 'hidden'}
            focusIndex={state.hiddenIndex}
            accentColor={accentColor}
            dimColor={dimColor}
          />
        </Box>
      </Box>
    </AppModal>
  );
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerStatuslineCommand(registry: CommandRegistry) {
  registry.register({
    id: '/statusline',
    type: 'component',
    description: 'Configure statusline segments and layout',
    category: 'ui',
    keywords: ['footer', 'layout', 'segments'],
    component: StatuslineCommandComponent,
    createState({ config }) {
      const saved = config.get<Rows>('ui.statusline.rows');
      return {
        rows: saved ?? [[...DEFAULT_STATUSLINE_ROWS[0]], [...DEFAULT_STATUSLINE_ROWS[1]]],
      };
    },
  });
}
