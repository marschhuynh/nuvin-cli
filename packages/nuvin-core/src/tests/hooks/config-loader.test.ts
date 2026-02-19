import { describe, it, expect } from 'vitest';
import { loadHooksFromFrontmatter, type AgentFrontmatter } from '../../hooks/config-loader.js';
import type { HooksConfig } from '../../hooks/types.js';

describe('Hook Config Loader', () => {
  it('should load hooks from agent frontmatter', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [{ matcher: 'Bash', command: { command: './check.sh', timeout: 30 } }],
        post_tool_use: [{ matcher: 'Write|Edit', command: { command: './lint.sh' } }],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter);

    expect(config.pre_tool_use?.hooks).toHaveLength(1);
    expect(config.pre_tool_use?.hooks[0].matcher).toBe('Bash');
    expect(config.pre_tool_use?.hooks[0].command?.command).toBe('./check.sh');
    expect(config.pre_tool_use?.hooks[0].command?.timeout).toBe(30);

    expect(config.post_tool_use?.hooks).toHaveLength(1);
    expect(config.post_tool_use?.hooks[0].matcher).toBe('Write|Edit');
  });

  it('should return empty config for no hooks', () => {
    const config = loadHooksFromFrontmatter({});
    expect(config).toEqual({});
  });

  it('should handle empty hooks object', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {},
    };
    const config = loadHooksFromFrontmatter(frontmatter);
    expect(config).toEqual({});
  });

  it('should load all supported hook events', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_user_prompt: [{ command: { command: './pre-prompt.sh' } }],
        pre_tool_use: [{ command: { command: './pre-tool.sh' } }],
        permission_request: [{ command: { command: './permission.sh' } }],
        post_tool_use: [{ command: { command: './post-tool.sh' } }],
        pre_sub_agent: [{ command: { command: './pre-sub.sh' } }],
        post_sub_agent: [{ command: { command: './post-sub.sh' } }],
        pre_stop: [{ command: { command: './pre-stop.sh' } }],
        session_start: [{ command: { command: './start.sh' } }],
        session_end: [{ command: { command: './end.sh' } }],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter);

    expect(config.pre_user_prompt?.hooks).toHaveLength(1);
    expect(config.pre_tool_use?.hooks).toHaveLength(1);
    expect(config.permission_request?.hooks).toHaveLength(1);
    expect(config.post_tool_use?.hooks).toHaveLength(1);
    expect(config.pre_sub_agent?.hooks).toHaveLength(1);
    expect(config.post_sub_agent?.hooks).toHaveLength(1);
    expect(config.pre_stop?.hooks).toHaveLength(1);
    expect(config.session_start?.hooks).toHaveLength(1);
    expect(config.session_end?.hooks).toHaveLength(1);
  });

  it('should preserve enabled and once flags', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          {
            matcher: 'Bash',
            command: { command: './check.sh' },
            enabled: false,
            once: true,
          },
        ],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter);

    expect(config.pre_tool_use?.hooks[0].enabled).toBe(false);
    expect(config.pre_tool_use?.hooks[0].once).toBe(true);
  });

  it('should handle prompt-based hooks', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          {
            matcher: 'Bash',
            prompt: {
              prompt: 'Should I allow this command?',
              timeout: 60,
            },
          },
        ],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter);

    expect(config.pre_tool_use?.hooks[0].prompt?.prompt).toBe('Should I allow this command?');
    expect(config.pre_tool_use?.hooks[0].prompt?.timeout).toBe(60);
  });

  it('should handle multiple hooks per event', () => {
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          { matcher: 'Bash', command: { command: './check-bash.sh' } },
          { matcher: 'Write', command: { command: './check-write.sh' } },
          { command: { command: './check-all.sh' } }, // No matcher - matches all
        ],
      },
    };

    const config = loadHooksFromFrontmatter(frontmatter);

    expect(config.pre_tool_use?.hooks).toHaveLength(3);
    expect(config.pre_tool_use?.hooks[2].matcher).toBeUndefined();
  });
});
