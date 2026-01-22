import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Box, Text } from 'ink';
import { CommandMenu } from '../../source/components/CommandMenu/CommandMenu.js';

vi.mock('../../source/components/SelectInput/SelectInput.js', () => ({
  SelectInput: ({ items, itemComponent: ItemComponent, indicatorComponent: IndicatorComponent }: {
    items: Array<{ label: string; value: { value: string; description?: string } }>;
    itemComponent: React.ComponentType<{ isSelected?: boolean; label: string; value: { value: string; description?: string } }>;
    indicatorComponent: React.ComponentType<{ isSelected?: boolean }>;
  }) => (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <Box key={item.label}>
          <IndicatorComponent isSelected={index === 0} />
          <ItemComponent isSelected={index === 0} label={item.label} value={item.value} />
        </Box>
      ))}
    </Box>
  ),
}));

vi.mock('../../source/contexts/AltModeContext.js', () => ({
  useAltMode: () => ({ altMode: false }),
}));

vi.mock('../../source/contexts/ThemeContext.js', () => ({
  useTheme: () => ({
    theme: {
      colors: { accent: 'cyan' },
      model: { item: 'white', selectedItem: 'cyan' },
    },
  }),
}));

describe('CommandMenu', () => {
  it('aligns descriptions using widest command width', () => {
    const { lastFrame } = render(
      <CommandMenu
        items={[
          { value: '/very-long-command', label: '/very-long-command', description: 'descA' },
          { value: '/vim', label: '/vim', description: 'descB' },
        ]}
      />,
    );

    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const lineA = lines.find((line) => line.includes('descA')) ?? '';
    const lineB = lines.find((line) => line.includes('descB')) ?? '';

    expect(lineA.indexOf('descA')).toBe(lineB.indexOf('descB'));
  });
});
