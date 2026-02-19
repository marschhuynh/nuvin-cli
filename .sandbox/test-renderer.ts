#!/usr/bin/env tsx

import { marked } from 'marked';
import { terminalRenderer } from '../packages/nuvin-cli/source/renderers/terminal-renderer.js';

function renderMarkdown(markdown: string, width = 120): string {
  const rendererConfig = {
    width,
    reflowText: true,
    hr: () => `\n${'⎼'.repeat(Math.min(width, 80))}\n`,
  };

  const renderer = terminalRenderer(rendererConfig, {});

  marked.use(renderer);

  const result = marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  return result.trim();
}

const exampleMarkdown = `## Completed ✅

Successfully removed the \`--require-approval\` CLI flag:

### Changes Made:
1. **\`packages/nuvin-cli/source/cli.tsx\`**:
   - Removed \`requireApproval\` from CLI flags definition
      - Removed \`requireApproval\` from CLI flags definition
   - Removed code that processed \`cli.flags.requireApproval\`
   - Removed flag from help text in the meow() description

2. **\`packages/nuvin-cli/README.md\`**:
   - Removed \`--require-approval\` flag documentation

3. **\`packages/nuvin-cli/CHANGELOG.md\`**:
   - Updated changelog to reflect both the security fix and flag removal

### Security Improvement:
- Tool approval now defaults to **enabled** (\`requireToolApproval: true\`)
- Users can only disable approval via:
  - Configuration files

  - Runtime \`/sudo\` command
- **No CLI bypass** for disabling tool approval anymore

The build completed successfully and the help output no longer shows the removed flag.`;

const _exampleMarkdown2 = `
Perfect! Now I have the full context. Let me provide a comprehensive summary of the new application creation logic:

## New Application Creation Logic

**Location:** \`src/packages/apply-mfe/src/components/RouteBorrower/index.js: 202-236\`

### **3 Creation Paths Based on User Type:**
`;

const rendered = renderMarkdown(exampleMarkdown);
console.log(rendered);

export { renderMarkdown };
