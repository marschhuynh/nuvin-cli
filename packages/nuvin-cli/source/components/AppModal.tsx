import type { ReactNode, FC } from 'react';
import { useEffect } from 'react';
import { Box, type BoxProps, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme, UndimmedThemeProvider } from '@/contexts/ThemeContext.js';

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
  height?: number | string;
  backdrop?: boolean;
  containerProps?: BoxProps;
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
  paddingX = 1,
  paddingY = 0,
  marginX = 1,
  marginY = 0,
  height,
  footer,
  backdrop = false,
  containerProps
}) => {
  const { originalTheme, setDimMode } = useTheme();
  const globalTheme = originalTheme;
  const finalTitleColor = titleColor || globalTheme.modal.title;

  useEffect(() => {
    if (visible) {
      setDimMode(true);
      return () => setDimMode(false);
    }
  }, [visible, setDimMode]);

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

  const modalContent = (
    <UndimmedThemeProvider>
      <Box height={height} flexDirection="column" width={"100%"} backgroundColor={globalTheme.modal.background} flexGrow={backdrop ? 0 : 1} {...containerProps}>
        <Box
          flexWrap="wrap"
          justifyContent="space-between"
          backgroundColor={globalTheme.modal.titleBackground}
          flexShrink={0}
        >
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
        <Box flexDirection="column" width={'100%'} marginTop={backdrop ? 0 : 1} flexGrow={1} overflow="hidden">
          <Box
            flexDirection="column"
            width={'100%'}
            paddingX={paddingX}
            paddingY={paddingY}
            marginX={marginX}
            marginY={marginY}
            flexGrow={1}
            overflow="hidden"
          >
            {children}
          </Box>
        </Box>
        {footer ? (
          <Box flexShrink={0} backgroundColor={globalTheme.modal.footerBackground} zIndex={20}>
            {footer}
          </Box>
        ) : (
          <Box flexShrink={0} zIndex={20} height={1} backgroundColor={globalTheme.modal.footerBackground}></Box>
        )}
      </Box>
    </UndimmedThemeProvider>
  );

  if (backdrop) {
    return (
      <Box
        flexDirection="column"
        width="100%"
        height="100%"
        alignItems="center"
        justifyContent="center"
      >
        {modalContent}
      </Box>
    );
  }

  return modalContent;
};

export default AppModal;
