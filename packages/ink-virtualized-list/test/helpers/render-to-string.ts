import { render } from "@nuvin/ink";
import type React from "react";
import createStdin from "./create-stdin.js";
import createStdout from "./create-stdout.js";

export const renderToString = (
  node: React.JSX.Element,
  options?: { columns?: number; isScreenReaderEnabled?: boolean },
): string => {
  const stdout = createStdout(options?.columns ?? 100);
  const stdin = createStdin();

  render(node, {
    stdout,
    stdin,
    debug: true,
    isScreenReaderEnabled: options?.isScreenReaderEnabled,
  });

  return stdout.get();
};
