import EventEmitter from "node:events";
import { vi } from "vitest";

type FakeStdout = NodeJS.WriteStream & {
  get: () => string;
};

const createStdout = (columns = 100): FakeStdout => {
  const stdout = new EventEmitter() as FakeStdout;
  stdout.columns = columns;
  stdout.rows = 24;
  stdout.isTTY = true;
  stdout.write = vi.fn(() => true) as unknown as NodeJS.WriteStream["write"];
  stdout.get = () => {
    const mock = stdout.write as unknown as ReturnType<typeof vi.fn>;
    for (let index = mock.mock.calls.length - 1; index >= 0; index--) {
      const normalized = ((mock.mock.calls[index]?.[0] as string | undefined) ?? "").replace(
        // biome-ignore lint/suspicious/noControlCharactersInRegex: cursor visibility sequence
        /\u001B\[\?25[hl]/g,
        "",
      );
      if (normalized.length > 0) {
        return normalized;
      }
    }

    return "";
  };
  return stdout;
};

export default createStdout;
