import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';

export function useStdoutDimensions(): { cols: number; rows: number } {
  return useStdoutDimensionsContext();
}
