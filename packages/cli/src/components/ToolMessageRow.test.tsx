import { describe, expect, it, vi } from "vitest";

import { ToolMessageRow } from "#src/components/ToolMessageRow.js";
import type { PendingApproval } from "#src/lib/approvals/queue.js";
import type { ToolTuiMessage } from "#src/lib/messages/state.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

function makeToolMessage(overrides: Partial<ToolTuiMessage> = {}): ToolTuiMessage {
  return {
    id: "message-1",
    role: "tool",
    status: "running",
    summary: "pnpm test",
    text: [
      "setup dependencies",
      "compile package a",
      "compile package b",
      "compile package c",
      "start unit tests",
      "test auth",
      "test billing",
      "test search",
      "test tui",
      "tail 1",
      "tail 2",
      "tail 3",
      "tail 4",
      "tail 5",
      "tail 6",
    ].join("\n"),
    toolCallId: "tool-1",
    toolName: "Bash",
    input: {
      command: "pnpm test",
    },
    ...overrides,
  };
}

function makeApproval(toolCallId = "tool-1"): PendingApproval {
  return {
    agentId: "assistant",
    resolve: vi.fn(),
    toolCall: {
      type: "tool_use",
      id: toolCallId,
      name: "Bash",
      input: {
        command: "pnpm test",
      },
    },
  };
}

describe("ToolMessageRow", () => {
  it("renders Bash with public-style header, tailing output, and running status", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          input: {
            command: "pnpm test",
            cwd: "/repo",
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("⏵ Running command · pnpm test at /repo");
    expect(frame).toContain("▌ ... 10 earlier lines");
    expect(frame).toMatch(/\n ▌ \.\.\. 10 earlier lines/);
    expect(frame).toContain("tail 2");
    expect(frame).toContain("tail 6");
    expect(frame).not.toContain("setup dependencies");
    expect(frame).not.toContain("\n  Running");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    expect(frame).toMatch(/^\n ⏵ Running command · pnpm test at \/repo/);
    expect(frame).not.toMatch(/^\n\n/);

    cleanup();
  });

  it("renders completed Bash with exit status", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          text: "done\n",
          structured: {
            exitCode: 0,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Ran command · pnpm test");
    expect(frame).toContain("▌ done");
    expect(frame).toMatch(/\n ▌ done/);
    expect(frame).not.toContain("\n  Executed (exit 0)");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");

    cleanup();
  });

  it("renders the active approval prompt only for the matching tool call", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "pending",
          text: "",
          toolCallId: "tool-2",
        })}
        activeApproval={makeApproval("tool-2")}
        onApprovalDecision={vi.fn()}
        queuedApprovalCount={1}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("◌ Waiting to run command · pnpm test");
    expect(frame).toContain("+ Run project tests");
    expect(frame).toContain("1/2");
    expect(frame).not.toContain("Parameters:");

    cleanup();
  });

  it("renders rejected tool calls without an output block", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "rejected",
          text: "User rejected tool execution (Bash)",
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("⊘ Skipped command · pnpm test");
    expect(frame).not.toContain("\n  Denied");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    expect(frame).not.toContain("User rejected tool execution");

    cleanup();
  });

  it("renders agent delegation tools with public-style dedicated output", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "running",
          summary: JSON.stringify({
            agentId: "researcher",
            task: "Inspect checkout flow",
          }),
          text: "Started agent run run_123.",
          toolName: "AssignTask",
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("⏵ Delegating · researcher");
    expect(frame).toContain("Inspect checkout flow");
    expect(frame).toContain("Started agent run run_123.");
    expect(frame).not.toContain('"agentId"');

    cleanup();
  });

  it("keeps a generic fallback for tools without a dedicated renderer", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          summary: "src/index.ts",
          text: ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"),
          toolName: "ReadFileTool",
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Completed · src/index.ts");
    expect(frame).toContain("line 1");
    expect(frame).toContain("line 6");
    expect(frame).toContain("... 1 more line");
    expect(frame).not.toContain("line 7");

    cleanup();
  });

  it("renders FileRead collapsed on success with line range in the header", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          summary: "src/app.ts",
          text: "line body that should stay collapsed",
          toolName: "FileRead",
          input: {
            path: "src/app.ts",
            lineStart: 10,
            lineEnd: 20,
          },
          structured: {
            totalLines: 40,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Read file · src/app.ts:10-20");
    expect(frame).not.toContain("line body that should stay collapsed");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    expect(frame).toMatch(/^✓ Read file · src\/app\.ts:10-20/);
    expect(frame).not.toMatch(/^\n\n/);

    cleanup();
  });

  it("renders FileNew with created byte and line status", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          summary: "src/new.ts",
          text: "File written at src/new.ts.",
          toolName: "FileNew",
          input: {
            filePath: "src/new.ts",
            content: "export const value = 1;\n",
          },
          structured: {
            filePath: "src/new.ts",
            lines: 2,
            bytes: 24,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Created file (2 lines, 24 bytes) · src/new.ts");
    expect(frame).not.toContain("export const value");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");

    cleanup();
  });

  it("renders completed FileEdit messages as a diff and hides generic success output", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          summary: "src/config.ts",
          text: "Edit applied successfully.",
          toolName: "FileEdit",
          input: {
            filePath: "src/config.ts",
            oldText: 'const value = "hello";',
            newText: 'const value = "world";',
          },
          structured: {
            filePath: "src/config.ts",
            bytesWritten: 65,
            lineNumbers: {
              oldStartLine: 5,
              oldEndLine: 5,
              newStartLine: 5,
              newEndLine: 5,
              oldLineCount: 1,
              newLineCount: 1,
            },
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Edited file (65 bytes) · src/config.ts");
    expect(frame).toContain("src/config.ts");
    expect(frame).toContain('5│ -const value = "hello";');
    expect(frame).toContain('5│ +const value = "world";');
    expect(frame).not.toContain("\n  Edited (65 bytes)");
    expect(frame).not.toContain("Edit applied successfully.");
    expect(frame).not.toContain("└─");
    expect(frame).toMatch(/^\n ✓ Edited file \(65 bytes\) · src\/config\.ts/);
    expect(frame).not.toMatch(/^\n\n/);

    cleanup();
  });

  it("renders Grep with match status from structured metadata", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          text: "Found 5 matches",
          toolName: "Grep",
          input: {
            pattern: "TODO",
            path: "src",
          },
          structured: {
            pattern: "TODO",
            searchPath: "src",
            matchCount: 5,
            fileCount: 2,
            truncated: false,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Found 5 matches in 2 files · TODO at src");
    expect(frame).not.toContain("Found 5 matches\n");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    expect(frame).toMatch(/^✓ Found 5 matches in 2 files · TODO at src/);
    expect(frame).not.toMatch(/^\n\n/);

    cleanup();
  });

  it("renders Grep not-found status for zero matches", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          text: "No matches found",
          toolName: "Grep",
          input: {
            pattern: "missing",
          },
          structured: {
            matchCount: 0,
            fileCount: 0,
            truncated: false,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Not found · missing");
    expect(frame).toContain("Not found");
    expect(frame).not.toContain("└─");
    cleanup();
  });

  it("renders Glob with truncated file count status", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          text: "src/a.ts\nsrc/b.ts",
          toolName: "Glob",
          input: {
            pattern: "**/*.ts",
          },
          structured: {
            count: 100,
            truncated: true,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Found 100 files (truncated) · **/*.ts");
    expect(frame).not.toContain("src/a.ts");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    cleanup();
  });

  it("renders Ls with entry count status", async () => {
    const { cleanup, lastFrame } = renderTest(
      <ToolMessageRow
        markdownWidth={80}
        message={makeToolMessage({
          status: "ok",
          text: "path: src\ntotal: 4",
          toolName: "Ls",
          input: {
            path: "src",
          },
          structured: {
            total: 4,
            truncated: false,
          },
        })}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Listed 4 entries · src");
    expect(frame).not.toContain("total: 4");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    cleanup();
  });
});
