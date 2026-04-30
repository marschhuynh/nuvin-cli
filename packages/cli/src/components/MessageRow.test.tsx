import { Box, type DOMElement, measureElement } from "@nuvin/ink";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { MessageRow } from "#src/components/MessageRow.js";
import type { PendingApproval } from "#src/lib/approvals/queue.js";
import type { ToolTuiMessage } from "#src/lib/messages/state.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

function makeToolMessage(toolCallId = "tool-1"): ToolTuiMessage {
  return {
    id: "message-1",
    role: "tool",
    status: "pending",
    summary: "pnpm test",
    text: "",
    toolCallId,
    toolName: "Bash",
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
        command: "pnpm test 2>&1",
        timeout_ms: 120000,
      },
    },
  };
}

const LONG_BASH_OUTPUT = [
  "setup dependencies",
  "compile package a",
  "compile package b",
  "compile package c",
  "start unit tests",
  "test auth",
  "test billing",
  "test search",
  "test tui",
  "test cli",
  "test agent",
  "tail 1",
  "tail 2",
  "tail 3",
  "tail 4",
  "tail 5",
  "tail 6",
].join("\n");

describe("MessageRow", () => {
  it("stretches message and tool rows to the parent width", async () => {
    const measuredWidths: number[] = [];

    function MeasuredRow({ message }: { message: Parameters<typeof MessageRow>[0]["message"] }) {
      const ref = React.useRef<DOMElement | null>(null);

      React.useLayoutEffect(() => {
        if (ref.current) {
          measuredWidths.push(measureElement(ref.current).width);
        }
      });

      return (
        <Box ref={ref} flexDirection="column">
          <MessageRow markdownWidth={80} message={message} />
        </Box>
      );
    }

    const { cleanup } = renderTest(
      <Box width={40} flexDirection="column">
        <MeasuredRow message={{ id: "assistant-1", role: "assistant", text: "hello" }} />
        <MeasuredRow
          message={{
            ...makeToolMessage(),
            id: "tool-1",
            status: "ok",
            text: "done",
          }}
        />
      </Box>,
    );

    await waitForInk();
    cleanup();

    expect(measuredWidths).toEqual([40, 40]);
  });

  it("renders a pending command row with natural status text", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow markdownWidth={80} message={makeToolMessage()} />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("◌ Waiting to run command · pnpm test");
    expect(frame).not.toContain("Bash");
    expect(frame).not.toContain("\n  Waiting");
    expect(frame).not.toContain("└─");
    expect(frame).not.toContain("│");
    // Only the active approval row renders controls.
    expect(frame).not.toContain("approve?");
    expect(frame).not.toContain("Approve ");
    cleanup();
  });

  it("renders assistant markdown", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={{ id: "assistant-md", role: "assistant", text: "# Plan\n\n- **Ship**" }}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("# Plan");
    expect(frame).toContain("Ship");
    cleanup();
  });

  it("renders reasoning markdown", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={{ id: "reasoning-md", role: "reasoning", text: "## Thought\n\n`check`" }}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("## Thought");
    expect(frame).toContain("check");
    cleanup();
  });

  it("renders the active approval prompt inline on the matching tool row", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={makeToolMessage("tool-2")}
        activeApproval={makeApproval("tool-2")}
        onApprovalDecision={vi.fn()}
        queuedApprovalCount={2}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("◌ Waiting to run command · pnpm test");
    expect(frame).not.toContain("Bash");
    expect(frame).toContain("+ Run project tests");
    expect(frame).toContain("1/3");
    expect(frame).not.toContain("Parameters:");
    expect(frame).not.toContain("Command: pnpm test 2>&1");
    expect(frame).not.toContain("Timeout (ms): 120000");
    expect(frame).toContain("› Yes");
    expect(frame).toContain("No");
    expect(frame).toContain("Yes, for this session");
    expect(frame).toContain("Input your changes here");
    expect(frame).toContain("Tab cycle focus");

    cleanup();
  });

  it("keeps approval controls off rows that are waiting but not active", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={makeToolMessage("tool-1")}
        activeApproval={makeApproval("tool-2")}
        onApprovalDecision={vi.fn()}
        queuedApprovalCount={1}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("◌ Waiting to run command · pnpm test");
    expect(frame).not.toContain("+ Run project tests");
    expect(frame).not.toContain("Input your changes here");
    expect(frame).not.toContain("Tab cycle focus");

    cleanup();
  });

  it("renders running command output as a block with the last six streamed lines", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={{
          ...makeToolMessage(),
          status: "running",
          text: `${LONG_BASH_OUTPUT}\n`,
        }}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("⏵ Running command · pnpm test");
    expect(frame).not.toContain("Bash");
    expect(frame).not.toContain("│");
    expect(frame).toContain("... 12 earlier lines");
    expect(frame).toContain("tail 2");
    expect(frame).toContain("tail 3");
    expect(frame).toContain("tail 4");
    expect(frame).toContain("tail 5");
    expect(frame).toContain("tail 6");
    expect(frame).not.toContain("setup dependencies");
    expect(frame).not.toContain("compile package a");
    expect(frame).not.toContain("test agent");

    cleanup();
  });

  it("renders completed command output as a block with the last six lines", async () => {
    const { cleanup, lastFrame } = renderTest(
      <MessageRow
        markdownWidth={80}
        message={{
          ...makeToolMessage(),
          status: "ok",
          text: `${LONG_BASH_OUTPUT}\n`,
        }}
      />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("✓ Ran command · pnpm test");
    expect(frame).not.toContain("Bash");
    expect(frame).not.toContain("│");
    expect(frame).toContain("... 11 earlier lines");
    expect(frame).toContain("tail 1");
    expect(frame).toContain("tail 6");
    expect(frame).not.toContain("setup dependencies");
    expect(frame).not.toContain("test agent");

    cleanup();
  });
});
