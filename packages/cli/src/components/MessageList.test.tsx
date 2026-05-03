import EventEmitter from "node:events";
import { Box, render } from "@nuvin/ink";
import { InputSetup, inputStore, resetInputStore } from "@nuvin/ink-input";
import { describe, expect, it, vi } from "vitest";

import {
  estimateMessageGapBefore,
  estimateMessageHeight,
  MESSAGE_LIST_OVERSCAN,
  MessageList,
} from "#src/components/MessageList.js";
import type { PendingApproval } from "#src/lib/approvals/queue.js";
import { renderedMarkdownLineCount } from "#src/lib/markdown/render.js";
import type { TuiMessage } from "#src/lib/messages/state.js";
import { resolveThemeRuntime } from "#src/lib/theme/runtime.js";
import { getTheme } from "#src/lib/theme/store.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence stripping
const stripFrame = (output: string) => output.replace(/\u001B\[[0-9;?]*[A-Za-z]/g, "");

const makeMessages = (count: number): TuiMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `message-${index}`,
    role: "user" as const,
    text: `message ${index}`,
  }));

function makeApproval(toolCallId = "tool-1"): PendingApproval {
  return {
    agentId: "assistant",
    resolve: vi.fn(),
    toolCall: {
      type: "tool_use",
      id: toolCallId,
      name: "Bash",
      input: {
        command: "pnpm test 2>&1",
        timeout_ms: 120000,
      },
    },
  };
}

function makeToolMessage(toolCallId = "tool-1"): TuiMessage {
  return {
    id: `message-${toolCallId}`,
    role: "tool",
    status: "pending",
    summary: "pnpm test",
    text: "",
    toolCallId,
    toolName: "Bash",
  };
}

type FakeStdout = NodeJS.WriteStream & {
  get: () => string;
};

type FakeStdin = NodeJS.ReadStream & {
  send: (input: string) => void;
};

const createStdout = (columns = 80): FakeStdout => {
  const stdout = new EventEmitter() as FakeStdout;
  stdout.columns = columns;
  stdout.rows = 24;
  stdout.isTTY = true;
  stdout.write = vi.fn(() => true) as unknown as NodeJS.WriteStream["write"];
  stdout.get = () => {
    const mock = stdout.write as unknown as ReturnType<typeof vi.fn>;
    for (let index = mock.mock.calls.length - 1; index >= 0; index--) {
      const frame = `${mock.mock.calls[index]?.[0] ?? ""}`;
      if (frame.length > 0) {
        return frame;
      }
    }

    return "";
  };

  return stdout;
};

const createStdin = (): FakeStdin => {
  const stdin = new EventEmitter() as FakeStdin;
  stdin.isTTY = true;
  stdin.setEncoding = () => stdin;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  stdin.read = () => null;
  stdin.send = (input: string) => {
    let pending: string | null = input;
    stdin.read = () => {
      if (pending === null) {
        return null;
      }

      const next = pending;
      pending = null;
      return next;
    };
    stdin.emit("readable");
    stdin.read = () => null;
  };

  return stdin;
};

describe("MessageList", () => {
  it("keeps scroll overscan small to limit remounted rows", () => {
    expect(MESSAGE_LIST_OVERSCAN).toBeLessThanOrEqual(2);
  });

  it("adds a gap before background-block tools but not before read-only tools", () => {
    const theme = resolveThemeRuntime({
      backgrounds: "on",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
      mode: "dark",
    }).theme;
    const messages: TuiMessage[] = [
      {
        id: "read-tool",
        role: "tool",
        status: "ok",
        summary: ".",
        text: "",
        toolCallId: "read-tool",
        toolName: "Ls",
      },
      {
        id: "bash-tool",
        role: "tool",
        status: "ok",
        summary: "npm test",
        text: "done",
        toolCallId: "bash-tool",
        toolName: "Bash",
      },
      {
        id: "delegate-tool",
        role: "tool",
        status: "running",
        summary: JSON.stringify({ agentId: "worker", task: "Run tests" }),
        text: "Started.",
        toolCallId: "delegate-tool",
        toolName: "AssignTask",
      },
      {
        id: "grep-tool",
        role: "tool",
        status: "ok",
        summary: "TODO",
        text: "",
        toolCallId: "grep-tool",
        toolName: "Grep",
      },
    ];

    expect(messages.map((_, index) => estimateMessageGapBefore(messages, index, theme))).toEqual([
      0, 1, 1, 0,
    ]);
  });

  it("adds a gap before tinted background message rows", () => {
    const theme = resolveThemeRuntime({
      backgrounds: "on",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
      messageStyle: "tinted",
      mode: "dark",
    }).theme;
    const messages: TuiMessage[] = [
      { id: "assistant-1", role: "assistant", text: "hello" },
      { id: "user-1", role: "user", text: "next" },
    ];

    expect(estimateMessageGapBefore(messages, 0, theme)).toBe(0);
    expect(estimateMessageGapBefore(messages, 1, theme)).toBe(1);
  });

  it("estimates collapsed read/search tool height from rendered rows, not raw output", () => {
    const longOutput = Array.from({ length: 20 }, (_, index) => `entry ${index}`).join("\n");

    // Backgroundless tools (Ls, FileRead, Glob, Grep) skip the outer padded
    // box so a successful collapsed row is just the single header line.
    expect(
      estimateMessageHeight({
        id: "ls-tool",
        role: "tool",
        status: "ok",
        summary: ".",
        text: longOutput,
        toolCallId: "ls-tool",
        toolName: "Ls",
        input: {
          path: ".",
        },
        structured: {
          total: 20,
        },
      }),
    ).toBe(1);

    expect(
      estimateMessageHeight({
        id: "read-tool",
        role: "tool",
        status: "ok",
        summary: "package.json",
        text: longOutput,
        toolCallId: "read-tool",
        toolName: "FileRead",
        input: {
          path: "package.json",
        },
      }),
    ).toBe(1);
  });

  it("accounts for wrapped FileRead headers when the path spans multiple lines", () => {
    const longPath =
      "/Users/marsch/Projects/nuvin-cli-v2/packages/cli/src/components/a-very-long-directory-name/another-long-segment/very-long-file-name.ts";

    expect(
      estimateMessageHeight({
        id: "read-tool-wrapped",
        role: "tool",
        status: "ok",
        summary: longPath,
        text: "",
        toolCallId: "read-tool-wrapped",
        toolName: "FileRead",
        input: {
          path: longPath,
          lineStart: 100,
          lineEnd: 140,
        },
      }),
    ).toBeGreaterThan(1);
  });

  it("accounts for wrapped headers across other tool renderers", () => {
    const longText =
      "/Users/marsch/Projects/nuvin-cli-v2/packages/cli/src/components/a-very-long-directory-name/another-long-segment/very-long-file-name.ts";

    const messages: TuiMessage[] = [
      {
        id: "bash-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "bash-wrapped",
        toolName: "Bash",
        input: {
          command: `sed -n '1,200p' ${longText}`,
          cwd: "/Users/marsch/Projects/nuvin-cli-v2",
        },
      },
      {
        id: "new-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "new-wrapped",
        toolName: "FileNew",
        input: {
          filePath: longText,
        },
      },
      {
        id: "edit-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "edit-wrapped",
        toolName: "FileEdit",
        input: {
          filePath: longText,
          oldText: "old\n",
          newText: "new\n",
        },
      },
      {
        id: "glob-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "glob-wrapped",
        toolName: "Glob",
        input: {
          pattern: `${longText}/**/*.ts`,
        },
      },
      {
        id: "grep-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "grep-wrapped",
        toolName: "Grep",
        input: {
          pattern: "very-long-search-pattern-that-will-wrap",
          path: longText,
        },
      },
      {
        id: "ls-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "ls-wrapped",
        toolName: "Ls",
        input: {
          path: longText,
        },
      },
      {
        id: "assign-wrapped",
        role: "tool",
        status: "ok",
        summary: JSON.stringify({
          agentId: "research-specialist-with-a-long-name",
          task: "Inspect this long-running task",
        }),
        text: "",
        toolCallId: "assign-wrapped",
        toolName: "AssignTask",
      },
      {
        id: "unknown-wrapped",
        role: "tool",
        status: "ok",
        summary: longText,
        text: "",
        toolCallId: "unknown-wrapped",
        toolName: "CustomTool",
      },
    ];

    for (const message of messages) {
      expect(estimateMessageHeight(message)).toBeGreaterThan(1);
    }
  });

  it("estimates bash tool height from the visible output preview", () => {
    const longOutput = Array.from({ length: 20 }, (_, index) => `line ${index}`).join("\n");

    // 2 padding + 1 header + 1 marginTop spacer + 1 hidden indicator + 5 lines.
    expect(
      estimateMessageHeight({
        id: "bash-tool",
        role: "tool",
        status: "running",
        summary: "npm test",
        text: longOutput,
        toolCallId: "bash-tool",
        toolName: "Bash",
        input: {
          command: "npm test",
        },
      }),
    ).toBe(10);
  });

  it("estimates assistant markdown height from rendered markdown", () => {
    const text =
      "| Topic | Notes |\n| - | - |\n| Markdown | A long table cell should wrap after the markdown terminal renderer converts it into a boxed table. |";
    const width = Math.max(20, (process.stdout.columns ?? 80) - 8);
    const expectedRenderedHeight =
      renderedMarkdownLineCount(text, {
        reflowText: false,
        theme: getTheme(),
        width,
      }) + 2;
    const rawHeight = text.split("\n").length + 2;

    expect(expectedRenderedHeight).toBeGreaterThan(rawHeight);
    expect(
      estimateMessageHeight({
        id: "assistant-md",
        role: "assistant",
        text,
      }),
    ).toBe(expectedRenderedHeight);
  });

  it("accounts for text wrapping in user messages at the terminal width", () => {
    const longLine = "x".repeat(400);
    const height = estimateMessageHeight({ id: "u", role: "user", text: longLine });
    // wraps long line into many rows, plus 2 padding.
    expect(height).toBeGreaterThan(5);
  });

  it("includes nested delegation child heights in the parent estimate", () => {
    const childIndex = new Map<string, TuiMessage[]>();
    childIndex.set("d", [
      { id: "c1", role: "user", text: "child message one" },
      { id: "c2", role: "assistant", text: "child reply" },
    ]);

    const heightWithChildren = estimateMessageHeight(
      {
        id: "d",
        role: "tool",
        status: "ok",
        summary: JSON.stringify({ agentId: "worker", task: "Run tests" }),
        text: "Done",
        toolCallId: "d",
        toolName: "AssignTask",
      },
      null,
      childIndex,
    );

    const heightAlone = estimateMessageHeight({
      id: "d",
      role: "tool",
      status: "ok",
      summary: JSON.stringify({ agentId: "worker", task: "Run tests" }),
      text: "Done",
      toolCallId: "d",
      toolName: "AssignTask",
    });

    expect(heightWithChildren).toBeGreaterThan(heightAlone);
  });

  it("estimates delegated assistant markdown at the nested render width", () => {
    const columns = 30;
    const childMarkdown =
      "| Topic | Notes |\n| - | - |\n| Markdown | A long table cell should wrap differently inside a nested delegated row. |";
    const childIndex = new Map<string, TuiMessage[]>();
    childIndex.set("d", [{ id: "c", role: "assistant", text: childMarkdown }]);

    const parent: TuiMessage = {
      id: "d",
      role: "tool",
      status: "ok",
      summary: JSON.stringify({ agentId: "worker", task: "Run tests" }),
      text: "",
      toolCallId: "d",
      toolName: "AssignTask",
    };
    const parentOnlyHeight = estimateMessageHeight(parent, null, undefined, columns);
    const nestedMarkdownWidth = Math.max(20, columns - 2 - 4);
    const topLevelMarkdownWidth = Math.max(20, columns - 4);
    const nestedChildHeight =
      renderedMarkdownLineCount(childMarkdown, {
        reflowText: false,
        theme: getTheme(),
        width: nestedMarkdownWidth,
      }) + 2;

    expect(nestedMarkdownWidth).not.toBe(topLevelMarkdownWidth);
    expect(
      renderedMarkdownLineCount(childMarkdown, {
        reflowText: false,
        theme: getTheme(),
        width: nestedMarkdownWidth,
      }),
    ).not.toBe(
      renderedMarkdownLineCount(childMarkdown, {
        reflowText: false,
        theme: getTheme(),
        width: topLevelMarkdownWidth,
      }),
    );
    expect(estimateMessageHeight(parent, null, childIndex, columns)).toBe(
      parentOnlyHeight + nestedChildHeight,
    );
  });

  it("adds the inline-approval prompt height when active on a tool", () => {
    const message: TuiMessage = {
      id: "t",
      role: "tool",
      status: "pending",
      summary: "ls",
      text: "",
      toolCallId: "tool-x",
      toolName: "Bash",
    };
    const without = estimateMessageHeight(message);
    const withApproval = estimateMessageHeight(message, makeApproval("tool-x"));
    expect(withApproval - without).toBe(7);
  });

  it("keeps approved and running Bash rows at least as tall as the approval state", () => {
    const pending: TuiMessage = {
      id: "bash",
      role: "tool",
      status: "pending",
      summary: "pnpm test",
      text: "",
      toolCallId: "tool-x",
      toolName: "Bash",
    };
    const pendingWithApproval = estimateMessageHeight(pending, makeApproval("tool-x"));

    for (const status of ["approved", "running"] as const) {
      expect(
        estimateMessageHeight({
          ...pending,
          status,
        }),
      ).toBeGreaterThanOrEqual(pendingWithApproval);
    }
  });

  it("does not reserve approval height for read and listing tools after approval", () => {
    const toolMessages: TuiMessage[] = [
      {
        id: "file-read",
        role: "tool",
        status: "pending",
        summary: "src/app.ts",
        text: "",
        toolCallId: "tool-x",
        toolName: "FileRead",
      },
      {
        id: "glob",
        role: "tool",
        status: "pending",
        summary: "**/*.ts",
        text: "",
        toolCallId: "tool-x",
        toolName: "Glob",
      },
      {
        id: "grep",
        role: "tool",
        status: "pending",
        summary: "TODO",
        text: "",
        toolCallId: "tool-x",
        toolName: "Grep",
      },
      {
        id: "ls",
        role: "tool",
        status: "pending",
        summary: ".",
        text: "",
        toolCallId: "tool-x",
        toolName: "Ls",
      },
    ];

    for (const pending of toolMessages) {
      const pendingWithoutApproval = estimateMessageHeight(pending);

      for (const status of ["approved", "running"] as const) {
        expect(
          estimateMessageHeight({
            ...pending,
            status,
          }),
        ).toBe(pendingWithoutApproval);
      }
    }
  });

  it("enables terminal mouse-reporting mode when the list is focused", async () => {
    resetInputStore();
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <Box height={6} width={40}>
          <MessageList messages={makeMessages(10)} />
        </Box>
      </InputSetup>,
      {
        stdout,
        stdin,
        debug: true,
      },
    );

    await waitForInk();
    const mouseModeEnabled = inputStore.getState().isMouseModeEnabled;

    instance.unmount();
    instance.cleanup();

    expect(mouseModeEnabled).toBe(true);
  });

  it("scrolls the active inline approval row into the visible viewport", async () => {
    resetInputStore();
    const stdout = createStdout();
    const stdin = createStdin();
    const messages: TuiMessage[] = [
      ...makeMessages(4),
      makeToolMessage("tool-needs-approval"),
      ...makeMessages(30).map((message, index) => ({
        ...message,
        id: `message-after-${index}`,
        text: `after approval ${index}`,
      })),
    ];

    const instance = render(
      <InputSetup>
        <Box height={14} width={80}>
          <MessageList
            activeApproval={makeApproval("tool-needs-approval")}
            messages={messages}
            onApprovalDecision={vi.fn()}
            queuedApprovalCount={2}
          />
        </Box>
      </InputSetup>,
      {
        stdout,
        stdin,
        debug: true,
      },
    );

    await waitForInk();
    const frame = stripFrame(stdout.get());

    instance.unmount();
    instance.cleanup();

    expect(frame).toContain("Yes");
    expect(frame).toContain("No");
    expect(frame).toContain("Yes, for this session");
    expect(frame).toContain("Input your changes here");
    expect(frame).not.toContain("after approval 29");
  });
});
