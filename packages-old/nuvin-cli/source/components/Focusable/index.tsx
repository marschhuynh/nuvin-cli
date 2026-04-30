import type React from 'react';
import { useFocus } from '@/contexts/InputContext/FocusContext.js';

interface FocusableProps {
  children: (context: { isFocused: boolean }) => React.ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
  focusId?: string;
  tabIndex?: number | string;
}

export const Focusable: React.FC<FocusableProps> = ({ children, autoFocus, disabled, focusId, tabIndex }) => {
  const { isFocused } = useFocus({ active: !disabled, autoFocus, id: focusId, tabIndex });
  return <>{children({ isFocused: disabled ? false : isFocused })}</>;
};

export default Focusable;
