import { Box, render } from "@nuvin/ink";
import { InputSetup } from "@nuvin/ink-input";
import type React from "react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import TextInput, { UncontrolledTextInput } from "../src/index.js";
import createStdin from "./helpers/create-stdin.js";
import createStdout from "./helpers/create-stdout.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

const getVisibleLines = (output: string) => {
  return output
    .split("\n")
    .map((line) => line.replace(/[│┃]/g, "").trimEnd())
    .filter(Boolean);
};

function ControlledTextInput(props: React.ComponentProps<typeof TextInput>) {
  const [value, setValue] = useState(props.value);
  return <TextInput {...props} value={value} onChange={setValue} />;
}

describe("TextInput", () => {
  it("exports controlled and uncontrolled components", () => {
    expect(TextInput).toBeDefined();
    expect(UncontrolledTextInput).toBeDefined();
  });

  it("supports typing and submit/clear flow", async () => {
    const onSubmit = vi.fn();
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <ControlledTextInput value="" onSubmit={onSubmit} />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("h");
    stdin.send("i");
    await waitForInk();
    expect(stdout.get()).toContain("hi");

    stdin.send("\r");
    await waitForInk();

    expect(onSubmit).toHaveBeenCalledWith("hi");
    expect(stdout.get()).toContain("hi");

    instance.unmount();
    instance.cleanup();
  });

  it("distinguishes backspace from forward delete", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <ControlledTextInput value="abcd" />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\x1b[D");
    stdin.send("\x1b[D");
    stdin.send("\x1b[3~");
    await waitForInk();

    expect(stdout.get()).toContain("abd");
    expect(stdout.get()).not.toContain("acd");

    instance.unmount();
    instance.cleanup();
  });

  it("supports home/end and ctrl-a/ctrl-e style row navigation", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <ControlledTextInput value="abcd" />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\x1b[H");
    stdin.send("X");
    await waitForInk();
    stdin.send("\u0005");
    stdin.send("Y");
    await waitForInk();

    expect(stdout.get()).toContain("XabcdY");

    instance.unmount();
    instance.cleanup();
  });

  it("inserts newline on shift-enter via kitty protocol", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup enableKittyProtocol={true}>
        <ControlledTextInput value="line1" />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\x1b[13;2u");
    stdin.send("b");
    await waitForInk();

    const lines = getVisibleLines(stdout.get());
    expect(lines).toEqual(["line1", "b"]);

    instance.unmount();
    instance.cleanup();
  });

  it("renders placeholder and mask states", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <TextInput value="" onChange={() => {}} placeholder="Type here" />
        <TextInput value="secret" onChange={() => {}} mask="*" focus={false} />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    const output = stdout.get();

    expect(output).toContain("Type here");
    expect(output).toContain("******");
    expect(output).not.toContain("secret");

    instance.unmount();
    instance.cleanup();
  });

  it("supports tab completion semantics", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const onTab = vi.fn(() => ({ value: "/help", cursorOffset: 5 }));

    const instance = render(
      <InputSetup>
        <ControlledTextInput value="/he" onTab={onTab} />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\t");
    await waitForInk();

    expect(onTab).toHaveBeenCalledWith("/he", 3, false);
    expect(stdout.get()).toContain("/help");

    instance.unmount();
    instance.cleanup();
  });

  it("supports vim mode transitions and insert commands", async () => {
    const stdout = createStdout();
    const stdin = createStdin();
    const onVimModeChange = vi.fn();

    const instance = render(
      <InputSetup>
        <ControlledTextInput value="" vimModeEnabled onVimModeChange={onVimModeChange} />
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("i");
    await waitForInk();
    stdin.send("a");
    await waitForInk();

    expect(onVimModeChange).toHaveBeenCalledWith("normal");
    expect(onVimModeChange).toHaveBeenCalledWith("insert");
    expect(stdout.get()).toContain("a");

    instance.unmount();
    instance.cleanup();
  });

  it("moves across wrapped visual rows", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <Box width={8}>
          <ControlledTextInput value="abcdefgh" maxLines={2} />
        </Box>
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();
    stdin.send("\x1b[A");
    stdin.send("X");
    await waitForInk();

    const output = stdout.get();
    expect(output).toContain("abcX");

    instance.unmount();
    instance.cleanup();
  });

  it("shows a scrollbar when content exceeds maxLines", async () => {
    const stdout = createStdout();
    const stdin = createStdin();

    const instance = render(
      <InputSetup>
        <Box width={8}>
          <ControlledTextInput value="abcdefghijk" maxLines={2} />
        </Box>
      </InputSetup>,
      { stdout, stdin, debug: true },
    );

    await waitForInk();

    expect(stdout.get()).toMatch(/[│┃]/);

    instance.unmount();
    instance.cleanup();
  });
});
