import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useInput } from '@/contexts/InputContext/index.js';
import { Focusable } from '@/components/Focusable/index.js';

interface ButtonProps {
  label: string;
  onSubmit: () => void;
  variant?: 'default' | 'danger';
  autoFocus?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ label, onSubmit, variant = 'default', autoFocus }) => {
  const { theme } = useTheme();

  const getColors = (isFocused: boolean) => {
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

  return (
    <Focusable autoFocus={autoFocus}>
      {({ isFocused }) => {
        useInput(
          (_input, key) => {
            if (key.return) {
              onSubmit();
            }
          },
          { isActive: isFocused },
        );

        const { backgroundColor, textColor } = getColors(isFocused);

        return (
          <Box backgroundColor={backgroundColor} paddingX={2}>
            <Text color={textColor} bold={isFocused}>
              {label}
            </Text>
          </Box>
        );
      }}
    </Focusable>
  );
};
