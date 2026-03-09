import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Markdown } from '../source/components/Markdown/index.tsx';

// Mock the markdown cache to avoid caching in tests
vi.mock('../source/utils/markdownCache.ts', () => {
  return {
    markdownCache: {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      clear: vi.fn(),
    },
  };
});

// Mock the dimensions hook
vi.mock('../source/hooks/useStdoutDimensions.ts', () => {
  return {
    useStdoutDimensions: vi.fn().mockReturnValue([80, 24]),
  };
});

describe('Markdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders markdown from issue tracking content with nested lists and formatting', () => {
    const content = `## Completed ✅

Successfully removed the \`--require-approval\` CLI flag:

### Changes Made:
1. **\`packages/nuvin-cli/source/cli.tsx\`**:
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

    const { lastFrame } = render(<Markdown>{content}</Markdown>);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders complex nested lists with 3 levels deep including mixed formatting', () => {
    const content = `# Project Requirements

## Main Features

1. **Authentication System**
   - User registration with *email validation*
     - Email verification via \`token\`
     - Password strength checker
       - Minimum 8 characters
       - Must include **special characters**
       - Must include *numbers*
   - OAuth integration
     - Google OAuth
       - User profile sync
       - Auto-create account
     - GitHub OAuth
       - Repository access
       - SSH key management
         - Generate new keys
         - Import existing keys

2. **Dashboard Components**
   - Analytics panel
     - Real-time metrics
       - Active users count
       - \`API request rate\`
       - Error rate tracking
     - Historical data
       - Last 7 days
       - Last 30 days
         - Export to CSV
         - Generate reports
   - User management
     - List all users
       - Filter by role
         - Admin
         - Editor
         - Viewer
       - Search functionality

## Technical Stack

- Frontend: **React** with *TypeScript*
  - State management: \`Redux Toolkit\`
    - Async actions with \`createAsyncThunk\`
    - Normalized state structure
      - Entities
      - UI state
  - Styling: **Tailwind CSS**
    - Custom theme
      - Brand colors
        - Primary: #3B82F6
        - Secondary: #8B5CF6

> **Note:** All items must be thoroughly tested with unit and integration tests.`;

    const { lastFrame } = render(<Markdown>{content}</Markdown>);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });
});
