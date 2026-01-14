import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { Focusable } from '@/components/Focusable/index.js';
import TextInput from '@/components/TextInput/index.js';

interface FormTextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  hint?: string;
  placeHolder?: string;
}

export const FormTextInput: React.FC<FormTextInputProps> = ({
  label,
  value,
  onChange,
  autoFocus,
  hint,
  placeHolder,
}) => {
  const { theme } = useTheme();
  return (
    <Focusable autoFocus={autoFocus}>
      {({ isFocused }) => (
        <Box flexDirection="column">
          <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>
            {label}
          </Text>
          <TextInput value={value} onChange={onChange} focus={isFocused} placeholder={placeHolder} />
          {hint && (
            <Text color={theme.history.help} dimColor>
              {hint}
            </Text>
          )}
        </Box>
      )}
    </Focusable>
  );
};
