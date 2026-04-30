import type React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import { useStdout } from 'ink';

type StdoutDimensions = {
  cols: number;
  rows: number;
};

const MIN_COLS = 10;
const MIN_ROWS = 5;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

const StdoutDimensionsContext = createContext<StdoutDimensions>({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS });

export function StdoutDimensionsProvider({ children }: { children: React.ReactNode }) {
  const { stdout } = useStdout();
  const [dimensions, setDimensions] = useState<StdoutDimensions>(() => {
    // Validate initial dimensions
    const cols = Math.max(MIN_COLS, Math.min(stdout.columns || DEFAULT_COLS, 1000));
    const rows = Math.max(MIN_ROWS, Math.min(stdout.rows || DEFAULT_ROWS, 1000));
    return { cols, rows };
  });

  useEffect(() => {
    const handleResize = () => {
      try {
        // Validate and sanitize the dimensions
        const newCols = stdout.columns;
        const newRows = stdout.rows;

        // Check for invalid values and apply bounds
        const validCols = newCols && newCols > 0 && newCols < 10000 ? Math.max(MIN_COLS, newCols) : DEFAULT_COLS;
        const validRows = newRows && newRows > 0 && newRows < 10000 ? Math.max(MIN_ROWS, newRows) : DEFAULT_ROWS;

        setDimensions((prev) => {
          if (prev.cols === validCols && prev.rows === validRows) {
            return prev;
          }
          return { cols: validCols, rows: validRows };
        });
      } catch (error) {
        // Fallback to safe defaults if any error occurs during resize
        console.warn('Error during resize, falling back to safe dimensions:', error);
        setDimensions((prev) => {
          if (prev.cols === DEFAULT_COLS && prev.rows === DEFAULT_ROWS) {
            return prev;
          }
          return { cols: DEFAULT_COLS, rows: DEFAULT_ROWS };
        });
      }
    };

    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  return <StdoutDimensionsContext.Provider value={dimensions}>{children}</StdoutDimensionsContext.Provider>;
}

export function useStdoutDimensionsContext(): { cols: number; rows: number } {
  const { cols, rows } = useContext(StdoutDimensionsContext);
  return { cols, rows };
}
