import type { ReactNode, FC } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '@/theme';

export type AppModalType = 'info' | 'error' | 'warning' | 'success' | 'default';

interface ModalTheme {
  borderColor: string;
  titleColor: string;
}

const MODAL_THEMES: Record<AppModalType, ModalTheme> = {
  info: {
    borderColor: 'cyan',
    titleColor: 'cyan',
  },
  error: {
    borderColor: 'red',
    titleColor: 'red',
  },
  warning: {
    borderColor: 'yellow',
    titleColor: 'yellow',
  },
  success: {
    borderColor: 'green',
    titleColor: 'green',
  },
  default: {
    borderColor: 'white',
    titleColor: theme.colors.accent,
  },
};

export interface AppModalProps {
  visible: boolean;
  title?: string;
  rightTitle?: string | ReactNode;
  type?: AppModalType;
  titleColor?: string;
  borderColor?: string;
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnEnter?: boolean;
  paddingX?: number;
  paddingY?: number;
  marginX?: number;
  marginY?: number;
}

export const AppModal: FC<AppModalProps> = ({
  visible,
  title,
  rightTitle,
  type = 'default',
  titleColor,
  borderColor,
  children,
  onClose,
  closeOnEscape = true,
  closeOnEnter = false,
  paddingX = 2,
  paddingY = 0,
  marginX = 1,
  marginY = 0,
}) => {
  const theme = MODAL_THEMES[type];
  const finalBorderColor = borderColor || theme.borderColor;
  const finalTitleColor = titleColor || theme.titleColor;

  useInput(
    (_input, key) => {
      if (key.escape && closeOnEscape && onClose) {
        onClose();
        return;
      }
      if (key.return && closeOnEnter && onClose) {
        onClose();
        return;
      }
    },
    { isActive: visible && !!onClose },
  );

  if (!visible) return null;

  return (
    <Box flexDirection="column" borderStyle="single" borderColor={finalBorderColor} width={'100%'}>
      <Box
        borderStyle="single"
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        borderColor={'gray'}
        justifyContent="space-between"
      >
        {title ? (
          <Text color={finalTitleColor} bold>
            {` + ${title}`}
          </Text>
        ) : null}

        {rightTitle ? (
          <Text color={finalTitleColor} bold>
            {rightTitle}{' '}
          </Text>
        ) : null}
      </Box>
      <Box paddingX={paddingX} paddingY={paddingY} marginX={marginX} marginY={marginY} width={'100%'}>
        <Box flexDirection="column" width={'100%'}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default AppModal;
