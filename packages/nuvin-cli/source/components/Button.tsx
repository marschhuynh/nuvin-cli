import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { useFocus } from '@/contexts/InputContext/FocusContext.js';

interface ButtonProps {
  label: string;
  onSubmit: () => void;
  variant?: 'default' | 'danger';
  autoFocus?: boolean;
  disabled?: boolean;
  focusId?: string;
}

export const Button: React.FC<ButtonProps> = ({ label, onSubmit, variant = 'default', autoFocus, disabled, focusId }) => {
  const { theme } = useTheme();
  const { isFocused } = useFocus({ active: !disabled, autoFocus, id: focusId });

  useInput(
    (_input, key) => {
      if (key.return && !disabled) {
        onSubmit();
      }
    },
    { isActive: isFocused && !disabled },
  );

  const getColors = (isFocused: boolean) => {
    if (disabled) {
      return {
        backgroundColor: theme.tokens.dim,
        textColor: theme.tokens.gray,
      };
    }
    if (variant === 'danger') {
      return {
        backgroundColor: isFocused ? theme.colors.error : theme.tokens.dimYellow,
        textColor: isFocused ? theme.tokens.white : theme.tokens.black,
      };
    }
    return {
      backgroundColor: isFocused ? theme.colors.accent : theme.tokens.dim,
      textColor: isFocused ? theme.tokens.white : theme.colors.muted,
    };
  };

  const { backgroundColor, textColor } = getColors(isFocused);

  return (
    <Box backgroundColor={backgroundColor} paddingX={2}>
      <Text color={textColor} bold={isFocused} dimColor={disabled}>
        {label}
      </Text>
    </Box>
  );
};
