import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { TextWrapper } from '../TextWrapper.js';
import type { CommandMenuItem } from './CommandMenu.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type Props = {
  isSelected?: boolean;
  label: string;
  value: CommandMenuItem;
  commandWidth: number;
};

export const CommandMenuItemComponent = ({ isSelected = false, value: item, commandWidth }: Props) => {
  const { theme } = useTheme();
  const { cols } = useStdoutDimensions();
  const descriptionWidth = Math.max(1, cols - commandWidth);

  return (
    <Box flexShrink={0}>
      <Box flexShrink={0} minWidth={commandWidth}>
        <Text
          color={isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || 'white'}
          bold={isSelected}
        >
          {`${item.value}`}
        </Text>
      </Box>
      <Box>
        <TextWrapper
          width={descriptionWidth}
          color={isSelected ? theme.model?.selectedItem || theme.colors.accent : theme.model?.item || 'white'}
          dimColor
          bold={isSelected}
        >
          {`${item?.description}`}
        </TextWrapper>
      </Box>
    </Box>
  );
};
