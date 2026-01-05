import type { ReactNode, FC } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext';
import { theme } from '@/theme';

export type AppModalType = 'info' | 'error' | 'warning' | 'success' | 'default';

export interface AppModalProps {
  visible: boolean;
  title?: string | ReactNode;
  rightTitle?: string | ReactNode;
  footer?: string | ReactNode;
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
  height?: number;
}

export const AppModal: FC<AppModalProps> = ({
  visible,
  title,
  rightTitle,
  titleColor,
  borderColor: _borderColor,
  children,
  onClose,
  closeOnEscape = true,
  closeOnEnter = false,
  paddingX = 2,
  paddingY = 0,
  marginX = 1,
  marginY = 0,
  height,
  footer,
}) => {
  const { theme: globalTheme } = useTheme();
  const finalTitleColor = titleColor || globalTheme.modal.title;

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
    <Box height={height} flexDirection="column" width="100%" backgroundColor={theme.modal.background}>
      <Box flexWrap="wrap" justifyContent="space-between" backgroundColor={globalTheme.modal.titleBackground}>
        {title ? (
          <Box>
            <Text color={finalTitleColor}>{` + `}</Text>
            <Text color={finalTitleColor} bold>
              {title}
            </Text>
          </Box>
        ) : null}

        {rightTitle ? (
          <Box alignItems="flex-end" alignSelf="flex-end" justifyContent="flex-end" flexGrow={1}>
            <Text color={finalTitleColor} bold>
              {rightTitle}{' '}
            </Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="column" width={'100%'} marginTop={1}>
        <Box
          flexDirection="column"
          width={'100%'}
          paddingX={paddingX}
          paddingY={paddingY}
          marginX={marginX}
          marginY={marginY}
        >
          {children}
        </Box>
        {footer ? (
          <Box
            flexGrow={1}
            borderStyle="single"
            borderLeft={false}
            borderRight={false}
            borderBottom={false}
            borderColor={globalTheme.tokens.gray}
          >
            {footer}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

export default AppModal;
