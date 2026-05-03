import { Box, render, Text } from "@nuvin/ink";
import stringWidth from "string-width";
import { describe, it } from "vitest";
import createStdin from "./helpers/create-stdin.js";
import createStdout from "./helpers/create-stdout.js";

const waitForInk = async () => {
  await new Promise((resolve) => setTimeout(resolve, 30));
};

describe("Terminal width analysis", () => {
  it("checks actual line widths for fullscreen layout", async () => {
    const COLS = 80;
    const ROWS = 10;
    const stdout = createStdout(COLS);
    stdout.rows = ROWS;
    const stdin = createStdin();

    // Simulate FlexLayout structure:
    // <Box column width={COLS} height={ROWS}>
    //   <Box flexGrow=1 overflow=hidden>  ← message area
    //     <Box row overflow=hidden flexGrow=1>  ← VirtualizedList outer
    //       <Box column flexGrow=1 overflow=hidden height=?>  ← content
    //       <Box column flexShrink=0 width=1>  ← scrollbar
    //     </Box>
    //   </Box>
    //   <Box flexShrink=0>  ← input
    //   <Box flexShrink=0 height=2>  ← footer
    // </Box>

    const instance = render(
      <Box flexDirection="column" width={COLS} height={ROWS}>
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Box flexDirection="row" overflow="hidden" flexGrow={1}>
            <Box flexDirection="column" flexGrow={1} overflow="hidden">
              <Text>Message line 1</Text>
              <Text>Message line 2</Text>
              <Text>Message line 3</Text>
            </Box>
            <Box flexDirection="column" flexShrink={0} width={1}>
              <Text>┃</Text>
              <Text>│</Text>
              <Text>│</Text>
            </Box>
          </Box>
        </Box>
        <Box flexDirection="column" flexShrink={0}>
          <Text>{"> prompt"}</Text>
        </Box>
        <Box flexShrink={0} height={2}>
          <Text>{"/ command · ESC×2 stop"}</Text>
          <Text>{""}</Text>
        </Box>
      </Box>,
      { stdout, stdin, debug: true },
    );
    await waitForInk();
    const output = stdout.get();
    instance.unmount();
    instance.cleanup();

    console.log("=== Raw output ===");
    console.log(JSON.stringify(output));
    console.log("\n=== Line analysis ===");
    const lines = output.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const w = stringWidth(lines[i] ?? "");
      console.log(`Line ${i}: width=${w}, raw=${JSON.stringify(lines[i])}`);
    }
    console.log(`\nTotal lines: ${lines.length}, expected: ${ROWS}`);
  });
});
