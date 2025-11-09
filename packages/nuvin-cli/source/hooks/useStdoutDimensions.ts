import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';

export function useStdoutDimensions(): [number, number] {
  return useStdoutDimensionsContext();
}
