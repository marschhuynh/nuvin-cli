import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileDiffView, createSimpleDiff } from '../source/components/FileDiffView.js';

// Mock the dimensions hook
vi.mock('../source/hooks/useStdoutDimensions.ts', () => {
  return {
    useStdoutDimensions: vi.fn().mockReturnValue([120, 30]),
  };
});

describe('FileDiffView - Snapshot Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Note: Ink's snapshot rendering with multiple <Text> components and background colors
  // can sometimes produce artifacts in the text output. The important part is that the
  // diff algorithm itself is correct (verified in FileDiffView.test.ts with segment tests).
  // These snapshots primarily verify the overall structure and line numbers.

  it('verifies tsconfig.json diff segments are correct (bug report case)', () => {
    // This test verifies the diff algorithm produces correct segments
    const oldText = `{
\t"compilerOptions": {
\t\t"target": "es2020",
\t\t"module": "esnext",
\t\t"moduleResolution": "bundler",
\t\t"outDir": "dist",
\t\t"esModuleInterop": true,
\t\t"allowSyntheticDefaultImports": true,
\t\t"skipLibCheck": true,
\t\t"strict": false,
\t\t"noImplicitAny": false,
\t\t"noUnusedLocals": false,
\t\t"noUnusedParameters": false,
\t\t"jsx": "react-jsx",
\t\t"resolveJsonModule": true,
\t\t"declaration": false,
\t\t"forceConsistentCasingInFileNames": false,
\t\t"isolatedModules": true,
\t\t"allowJs": true,
\t\t"checkJs": false
\t},
\t"include": ["source/**/*"],
\t"exclude": ["node_modules", "dist"]
}`;

    const newText = `{
\t"compilerOptions": {
\t\t"target": "es2020",
\t\t"module": "esnext",
\t\t"moduleResolution": "bundler",
\t\t"outDir": "dist",
\t\t"esModuleInterop": true,
\t\t"allowSyntheticDefaultImports": true,
\t\t"skipLibCheck": true,
\t\t"strict": false,
\t\t"noImplicitAny": false,
\t\t"noUnusedLocals": false,
\t\t"noUnusedParameters": false,
\t\t"jsx": "react-jsx",
\t\t"resolveJsonModule": true,
\t\t"declaration": false,
\t\t"forceConsistentCasingInFileNames": false,
\t\t"isolatedModules": true,
\t\t"allowJs": true,
\t\t"checkJs": false,
\t\t"baseUrl": ".",
\t\t"paths": {
\t\t\t"@/*": ["source/*"]
\t\t}
\t},
\t"include": ["source/**/*"],
\t"exclude": ["node_modules", "dist"]
}`;

    const lineNumbers = {
      oldStartLine: 1,
      oldEndLine: 24,
      newStartLine: 1,
      newEndLine: 28,
      oldLineCount: 24,
      newLineCount: 28,
    };

    const diff = createSimpleDiff(oldText, newText, lineNumbers);

    // Find the line 20 modify lines (the bug line)
    const line20Diffs = diff.filter((line) => {
      const lineNum = line.oldLineNum || line.newLineNum;
      return lineNum === 20;
    });

    expect(line20Diffs).toHaveLength(2); // One for old, one for new

    // Check the new line (with comma added)
    const newLine = line20Diffs.find((line) => line.newLineNum === 20);
    expect(newLine).toBeDefined();
    expect(newLine!.type).toBe('modify');
    expect(newLine!.segments).toBeDefined();

    // Verify segments
    const segments = newLine!.segments!;
    expect(segments).toHaveLength(2);

    // First segment should be unchanged text
    expect(segments[0].type).toBe('unchanged');
    expect(segments[0].text).toBe('\t\t"checkJs": false');

    // Second segment should be the added comma
    expect(segments[1].type).toBe('add');
    expect(segments[1].text).toBe(',');

    // Verify reconstruction
    const reconstructed = segments.map((s) => s.text).join('');
    expect(reconstructed).toBe('\t\t"checkJs": false,');
  });

  it('renders tsconfig.json diff from llm.json (bug report case)', () => {
    // This is the exact data from the bug report in llm.json
    const oldText = `{
\t"compilerOptions": {
\t\t"target": "es2020",
\t\t"module": "esnext",
\t\t"moduleResolution": "bundler",
\t\t"outDir": "dist",
\t\t"esModuleInterop": true,
\t\t"allowSyntheticDefaultImports": true,
\t\t"skipLibCheck": true,
\t\t"strict": false,
\t\t"noImplicitAny": false,
\t\t"noUnusedLocals": false,
\t\t"noUnusedParameters": false,
\t\t"jsx": "react-jsx",
\t\t"resolveJsonModule": true,
\t\t"declaration": false,
\t\t"forceConsistentCasingInFileNames": false,
\t\t"isolatedModules": true,
\t\t"allowJs": true,
\t\t"checkJs": false
\t},
\t"include": ["source/**/*"],
\t"exclude": ["node_modules", "dist"]
}`;

    const newText = `{
\t"compilerOptions": {
\t\t"target": "es2020",
\t\t"module": "esnext",
\t\t"moduleResolution": "bundler",
\t\t"outDir": "dist",
\t\t"esModuleInterop": true,
\t\t"allowSyntheticDefaultImports": true,
\t\t"skipLibCheck": true,
\t\t"strict": false,
\t\t"noImplicitAny": false,
\t\t"noUnusedLocals": false,
\t\t"noUnusedParameters": false,
\t\t"jsx": "react-jsx",
\t\t"resolveJsonModule": true,
\t\t"declaration": false,
\t\t"forceConsistentCasingInFileNames": false,
\t\t"isolatedModules": true,
\t\t"allowJs": true,
\t\t"checkJs": false,
\t\t"baseUrl": ".",
\t\t"paths": {
\t\t\t"@/*": ["source/*"]
\t\t}
\t},
\t"include": ["source/**/*"],
\t"exclude": ["node_modules", "dist"]
}`;

    const lineNumbers = {
      oldStartLine: 1,
      oldEndLine: 24,
      newStartLine: 1,
      newEndLine: 28,
      oldLineCount: 24,
      newLineCount: 28,
    };

    const { lastFrame } = render(
      <FileDiffView
        blocks={[{ search: oldText, replace: newText }]}
        filePath="tsconfig.json"
        showPath={true}
        lineNumbers={lineNumbers}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders simple comma addition (character-level highlighting)', () => {
    const oldText = '\t\t"checkJs": false';
    const newText = '\t\t"checkJs": false,';

    const { lastFrame } = render(
      <FileDiffView blocks={[{ search: oldText, replace: newText }]} filePath="test.json" showPath={false} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders middle-of-line change', () => {
    const oldText = 'const value = "hello";';
    const newText = 'const value = "world";';

    const { lastFrame } = render(
      <FileDiffView blocks={[{ search: oldText, replace: newText }]} filePath="test.js" showPath={false} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders multi-line addition', () => {
    const oldText = `function foo() {
  console.log("test");
}`;

    const newText = `function foo() {
  console.log("test");
  console.log("added line");
  console.log("another line");
}`;

    const { lastFrame } = render(
      <FileDiffView blocks={[{ search: oldText, replace: newText }]} filePath="test.js" showPath={false} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders multi-line removal', () => {
    const oldText = `function bar() {
  console.log("line 1");
  console.log("line 2");
  console.log("line 3");
  return true;
}`;

    const newText = `function bar() {
  console.log("line 1");
  return true;
}`;

    const { lastFrame } = render(
      <FileDiffView blocks={[{ search: oldText, replace: newText }]} filePath="test.js" showPath={false} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders multiple blocks of changes', () => {
    const block1 = {
      search: 'const oldValue = 1;',
      replace: 'const newValue = 2;',
    };

    const block2 = {
      search: 'let temp = "old";',
      replace: 'let temp = "new";',
    };

    const { lastFrame } = render(
      <FileDiffView blocks={[block1, block2]} filePath="test.js" showPath={true} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders identical content (no changes)', () => {
    const text = 'const unchanged = "same";';

    const { lastFrame } = render(
      <FileDiffView blocks={[{ search: text, replace: text }]} filePath="test.js" showPath={false} />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders empty blocks', () => {
    const { lastFrame } = render(<FileDiffView blocks={[]} filePath="test.js" showPath={false} />);

    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with line numbers metadata', () => {
    const oldText = 'old line';
    const newText = 'new line';
    const lineNumbers = {
      oldStartLine: 42,
      oldEndLine: 42,
      newStartLine: 42,
      newEndLine: 42,
      oldLineCount: 1,
      newLineCount: 1,
    };

    const { lastFrame } = render(
      <FileDiffView
        blocks={[{ search: oldText, replace: newText }]}
        filePath="test.js"
        showPath={false}
        lineNumbers={lineNumbers}
      />,
    );

    expect(lastFrame()).toMatchSnapshot();
  });
});
