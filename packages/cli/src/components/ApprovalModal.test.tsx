import { Box } from "@nuvin/ink";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import { ApprovalModal } from "#src/components/ApprovalModal.js";
import type { PendingApproval } from "#src/lib/approvals/queue.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

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

function makeFileEditApproval(): PendingApproval {
  return {
    agentId: "assistant",
    resolve: vi.fn(),
    toolCall: {
      type: "tool_use",
      id: "file-edit-1",
      name: "FileEdit",
      input: {
        filePath: "src/config.ts",
        oldText: 'const value = "hello";',
        newText: 'const value = "world";',
      },
    },
  };
}

// Modal uses position:absolute to overlay the layout — wrap in a sized
// position:relative parent (mirrors the app root).
function renderModal(node: React.ReactNode) {
  return renderTest(
    <Box position="relative" width={80} height={24} flexDirection="column">
      {node}
    </Box>,
  );
}

describe("ApprovalModal", () => {
  it("renders the approval prompt with title bar, parameters, three decisions, input, and key legend", async () => {
    const { cleanup, lastFrame } = renderModal(
      <ApprovalModal approval={makeApproval()} onDecision={vi.fn()} queuedCount={2} />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("+ Run project tests");
    expect(frame).toContain("1/3");
    expect(frame).toContain("Parameters:");
    expect(frame).toContain("Command: pnpm test 2>&1");
    expect(frame).toContain("Timeout (ms): 120000");

    expect(frame).toContain("› Yes");
    expect(frame).toContain("No");
    expect(frame).toContain("Yes, for this session");
    expect(frame).toContain("Input your changes here");

    expect(frame).toContain("Tab cycle focus");
    expect(frame).toContain("1 approve");
    expect(frame).toContain("2 deny");
    expect(frame).toContain("3 approve session");

    expect(frame).not.toContain("Approve Bash?");
    expect(frame).not.toContain("4 Other");

    cleanup();
  });

  it('submits approve when "1" is pressed', async () => {
    const onDecision = vi.fn();
    const { cleanup, stdin } = renderModal(
      <ApprovalModal approval={makeApproval()} onDecision={onDecision} queuedCount={0} />,
    );

    await waitForInk();
    stdin.write("1");
    await waitForInk();

    expect(onDecision).toHaveBeenCalledWith("y", undefined);
    cleanup();
  });

  it("submits deny when Esc is pressed", async () => {
    const onDecision = vi.fn();
    const { cleanup, stdin } = renderModal(
      <ApprovalModal approval={makeApproval()} onDecision={onDecision} queuedCount={0} />,
    );

    await waitForInk();
    stdin.write("\u001B"); // Esc
    // Esc has a 35ms flush delay in the input system to disambiguate from
    // CSI sequences. Wait generously so the test isn't sensitive to event
    // loop pressure when run alongside other ink-input tests.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(onDecision).toHaveBeenCalledWith("n", undefined);
    cleanup();
  });

  it("submits input text as a change request when Enter is pressed from the input", async () => {
    const onDecision = vi.fn();
    const { cleanup, stdin } = renderModal(
      <ApprovalModal approval={makeApproval()} onDecision={onDecision} queuedCount={0} />,
    );

    // Allow focus to register and any pending timers from previous tests
    // (e.g. escape flush) to drain before driving keystrokes.
    await new Promise((resolve) => setTimeout(resolve, 100));
    stdin.write("\t");
    await new Promise((resolve) => setTimeout(resolve, 60));
    stdin.write("\t");
    await new Promise((resolve) => setTimeout(resolve, 60));
    stdin.write("\t");
    await new Promise((resolve) => setTimeout(resolve, 60));
    stdin.write("use pnpm test -- --runInBand");
    await new Promise((resolve) => setTimeout(resolve, 60));
    stdin.write("\r");
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(onDecision).toHaveBeenCalledWith("o", "use pnpm test -- --runInBand");

    cleanup();
  });

  it("renders nothing when no approval is pending", async () => {
    const { cleanup, lastFrame } = renderModal(
      <ApprovalModal approval={null} onDecision={vi.fn()} queuedCount={0} />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).not.toContain("Run project tests");
    expect(frame).not.toContain("Tab cycle focus");
    cleanup();
  });

  it("renders FileEdit approval as a diff instead of raw JSON", async () => {
    const { cleanup, lastFrame } = renderModal(
      <ApprovalModal approval={makeFileEditApproval()} onDecision={vi.fn()} queuedCount={0} />,
    );

    await waitForInk();
    const frame = lastFrame();

    expect(frame).toContain("+ Edit src/config.ts");
    expect(frame).toContain('1│ -const value = "hello";');
    expect(frame).toContain('1│ +const value = "world";');
    expect(frame).not.toContain('"oldText"');
    expect(frame).not.toContain('"newText"');

    cleanup();
  });
});
