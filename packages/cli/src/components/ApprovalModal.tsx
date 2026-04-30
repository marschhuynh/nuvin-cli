import type { JsonObject, JsonValue } from "@nuvin/agent-core/shared";
import { Box, type BoxRef, Text } from "@nuvin/ink";
import { Button, Clickable, useInput } from "@nuvin/ink-input";
import TextInput from "@nuvin/ink-text-input";
import React, { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import { Modal } from "#src/components/Modal.js";
import { FileEditApprovalContent } from "#src/components/tool-renders/FileEditApprovalContent.js";
import type { ApprovalDecision, PendingApproval } from "#src/lib/approvals/queue.js";
import { useFullTheme } from "#src/lib/theme/store.js";
import { renderToolArgs } from "#src/lib/tools/argsRenderer.js";

export type ApprovalModalProps = {
  approval: PendingApproval | null;
  onDecision: (decision: ApprovalDecision, comment?: string) => void;
  queuedCount: number;
};

export type ApprovalPromptProps = ApprovalModalProps & {
  showParameters?: boolean;
  showHeader?: boolean;
};

type FocusTarget = "input" | "no" | "session" | "yes";

type ChoiceMeta = {
  colorKey: "blue" | "green" | "red";
  decision: ApprovalDecision;
  hint: string;
  id: Exclude<FocusTarget, "input">;
  label: string;
  numKey: "1" | "2" | "3";
};

const CHOICES: readonly ChoiceMeta[] = [
  {
    colorKey: "green",
    decision: "y",
    hint: "approve",
    id: "yes",
    label: "Yes",
    numKey: "1",
  },
  {
    colorKey: "red",
    decision: "n",
    hint: "deny",
    id: "no",
    label: "No",
    numKey: "2",
  },
  {
    colorKey: "blue",
    decision: "a",
    hint: "approve session",
    id: "session",
    label: "Yes, for this session",
    numKey: "3",
  },
] as const;

const FOCUS_ORDER: readonly FocusTarget[] = ["yes", "no", "session", "input"];
const SCROLL_PAGE_LINES = 8;

function asJsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

function renderCustomApprovalContent(approval: PendingApproval): ReactNode | null {
  if (approval.toolCall.name === "FileEdit") {
    return <FileEditApprovalContent toolCall={approval.toolCall} />;
  }

  return null;
}

function getApprovalTitle(approval: PendingApproval): string {
  const input = asJsonObject(approval.toolCall.input);

  if (approval.toolCall.name === "FileEdit") {
    const filePath = typeof input?.filePath === "string" ? input.filePath : undefined;
    return filePath ? `Edit ${filePath}` : "Edit file";
  }

  if (approval.toolCall.name === "Bash" && typeof input?.command === "string") {
    const command = input.command.trim();
    if (/^(?:pnpm|npm|yarn|bun)(?:\s+run)?\s+test\b/.test(command)) {
      return "Run project tests";
    }

    if (/^(?:pnpm|npm|yarn|bun)(?:\s+run)?\s+build\b/.test(command)) {
      return "Run project build";
    }

    return "Run command";
  }

  return approval.toolCall.name;
}

export function ApprovalPrompt({
  approval,
  onDecision,
  queuedCount,
  showParameters = true,
  showHeader = true,
}: ApprovalPromptProps) {
  const theme = useFullTheme();
  const [focus, setFocus] = useState<FocusTarget>("yes");
  const [hoveredChoiceId, setHoveredChoiceId] = useState<FocusTarget | null>(null);
  const [comment, setComment] = useState("");
  const argsRef = useRef<BoxRef | null>(null);
  const argsLines = useMemo(
    () => (approval && showParameters ? renderToolArgs(approval.toolCall) : []),
    [approval, showParameters],
  );
  const customArgsContent = useMemo(
    () => (approval && showParameters ? renderCustomApprovalContent(approval) : null),
    [approval, showParameters],
  );
  const title = approval ? getApprovalTitle(approval) : "";

  // Reset prompt state when a new approval arrives.
  const lastApprovalIdRef = useRef<string | null>(null);
  if (approval && approval.toolCall.id !== lastApprovalIdRef.current) {
    lastApprovalIdRef.current = approval.toolCall.id;
    if (focus !== "yes") setFocus("yes");
    if (comment.length > 0) setComment("");
  } else if (!approval && lastApprovalIdRef.current !== null) {
    lastApprovalIdRef.current = null;
  }

  const submit = useCallback(
    (decision: ApprovalDecision) => {
      if (!approval) return;
      const trimmed = comment.trim();
      const note = trimmed.length > 0 ? trimmed : undefined;
      onDecision(decision, note);
    },
    [approval, comment, onDecision],
  );

  const submitChangeRequest = useCallback(() => {
    // Input submits as deny-with-reason. Require non-empty text.
    if (comment.trim().length === 0) {
      setFocus("input");
      return;
    }
    submit("o");
  }, [comment, submit]);

  const scrollBy = useCallback((delta: number) => {
    const node = argsRef.current;
    if (!node) return;
    const current = node.getScrollPosition();
    node.scrollTo({ y: Math.max(0, current.y + delta) });
  }, []);

  useInput(
    (input, key) => {
      if (!approval) return;

      if (key.escape) {
        submit("n");
        return;
      }

      if (key.tab) {
        const currentIndex = FOCUS_ORDER.indexOf(focus);
        const nextIndex = key.shift
          ? (currentIndex - 1 + FOCUS_ORDER.length) % FOCUS_ORDER.length
          : (currentIndex + 1) % FOCUS_ORDER.length;
        setFocus(FOCUS_ORDER[nextIndex] ?? "yes");
        return;
      }

      // Scroll args body — works regardless of which control is focused so users
      // can read the args without losing their decision selection.
      if (showParameters && key.upArrow && focus !== "input") {
        scrollBy(-1);
        return;
      }
      if (showParameters && key.downArrow && focus !== "input") {
        scrollBy(1);
        return;
      }
      if (showParameters && key.pageUp) {
        scrollBy(-SCROLL_PAGE_LINES);
        return;
      }
      if (showParameters && key.pageDown) {
        scrollBy(SCROLL_PAGE_LINES);
        return;
      }

      if (focus === "input") {
        if (key.return) {
          submitChangeRequest();
        }
        return;
      }

      const choice = CHOICES.find((entry) => entry.numKey === input);
      if (choice) {
        submit(choice.decision);
        return;
      }
      if (input === "4") {
        setFocus("input");
        return;
      }

      if (key.return) {
        const focusedChoice = CHOICES.find((entry) => entry.id === focus);
        if (focusedChoice) submit(focusedChoice.decision);
      }
    },
    { isActive: approval !== null },
  );

  const surface = theme.tokens.black;
  const headerBackground = theme.tokens.orange;
  const footerBackground = theme.tokens.gray;
  const agentLabel = approval && approval.agentId !== "assistant" ? ` [${approval.agentId}]` : "";
  const approvalCount = queuedCount + 1;

  return approval ? (
    <Box flexDirection="column" width="100%">
      {showHeader && (
        <Box
          backgroundColor={headerBackground}
          justifyContent="space-between"
          paddingX={1}
          width="100%"
        >
          <Box backgroundColor={headerBackground}>
            <Text backgroundColor={headerBackground} bold color={theme.approval.headerText}>
              {`+ ${title}`}
            </Text>
            {agentLabel ? (
              <Text backgroundColor={headerBackground} color={theme.approval.headerText}>
                {agentLabel}
              </Text>
            ) : null}
          </Box>
          <Text backgroundColor={headerBackground} bold color={theme.approval.headerText}>
            {`1/${approvalCount}`}
          </Text>
        </Box>
      )}

      {showParameters ? (
        <Box flexDirection="column" backgroundColor={surface} paddingX={2} paddingY={1}>
          <Text backgroundColor={surface} color={theme.text.dim}>
            Parameters:
          </Text>
          <Box
            ref={argsRef}
            flexDirection="column"
            flexShrink={1}
            minHeight={1}
            overflowY="scroll"
            backgroundColor={surface}
            paddingLeft={2}
          >
            {customArgsContent ? (
              customArgsContent
            ) : argsLines.length > 0 ? (
              argsLines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed display-only array
                <Text key={`${index}-${line}`} backgroundColor={surface} color={theme.text.default}>
                  {line.length > 0 ? line : " "}
                </Text>
              ))
            ) : (
              <Text backgroundColor={surface} dimColor>
                (no parameters)
              </Text>
            )}
          </Box>
        </Box>
      ) : null}

      <Box backgroundColor={surface} paddingX={1} paddingTop={1}>
        {CHOICES.map((choice) => {
          const isFocused = focus === choice.id;
          const isHovered = hoveredChoiceId === choice.id;
          const choiceColor = theme.tokens[choice.colorKey];
          return (
            <Button
              key={choice.id}
              variant="text"
              color={choiceColor}
              surface={surface}
              focused={isFocused}
              onClick={() => submit(choice.decision)}
              onHover={(h) => setHoveredChoiceId(h ? choice.id : null)}
              isMouseActive={approval !== null}
              marginRight={2}
            >
              {choice.label}
            </Button>
          );
        })}
      </Box>

      <Clickable
        onClick={() => setFocus("input")}
        isMouseActive={approval !== null}
        backgroundColor={surface}
        padding={1}
      >
        <Text
          backgroundColor={surface}
          color={focus === "input" ? theme.approval.focusArrow : theme.approval.unfocused}
        >
          {focus === "input" ? "› " : "│ "}
        </Text>
        <TextInput
          value={comment}
          onChange={setComment}
          onSubmit={submitChangeRequest}
          focus={focus === "input"}
          placeholder="Input your changes here"
          showScrollbar={false}
        />
      </Clickable>

      <Box backgroundColor={footerBackground} paddingX={1} width="100%">
        <Text backgroundColor={footerBackground} bold color={theme.text.inverse}>
          Tab
        </Text>
        <Text backgroundColor={footerBackground} color={theme.text.inverse}>
          {" cycle focus"}
        </Text>
        {CHOICES.map((choice) => (
          <React.Fragment key={choice.id}>
            <Text backgroundColor={footerBackground} color={theme.text.inverse}>
              {" • "}
            </Text>
            <Text backgroundColor={footerBackground} bold color={theme.text.inverse}>
              {choice.numKey}
            </Text>
            <Text backgroundColor={footerBackground} color={theme.text.inverse}>
              {` ${choice.hint}`}
            </Text>
          </React.Fragment>
        ))}
      </Box>
    </Box>
  ) : null;
}

export function ApprovalModal(props: ApprovalModalProps) {
  const theme = useFullTheme();
  const open = props.approval !== null;

  return (
    <Modal open={open} backgroundColor={theme.tokens.black} padding={0} width="90%" maxWidth={999}>
      <ApprovalPrompt {...props} />
    </Modal>
  );
}
