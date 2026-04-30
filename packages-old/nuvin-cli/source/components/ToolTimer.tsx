import { useState, useEffect } from 'react';
import { Text } from 'ink';
import { formatTimeFromSeconds } from '@/utils/formatters.js';

/**
 * Timer component that counts elapsed time from creation until a result is available
 */
export const ToolTimer: React.FC<{ hasResult: boolean; finalDuration?: number }> = ({ hasResult, finalDuration }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (hasResult) {
      // Result is available, stop counting
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasResult]);

  const displayTime = hasResult && finalDuration !== undefined ? finalDuration : elapsed;
  const seconds = Math.floor(displayTime / 1000);

  if (elapsed > 0) {
    return <Text dimColor>{formatTimeFromSeconds(seconds)}</Text>;
  }
  return null;
};
