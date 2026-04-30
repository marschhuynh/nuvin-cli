import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { HookRegistry } from '../../hooks/hook-registry.js';
import { CompositeHookPort } from '../../hooks/composite-hook-port.js';
import { loadHooksFromFrontmatter, type AgentFrontmatter } from '../../hooks/config-loader.js';
import { HookEventTypes, type HookContext } from '../../hooks/types.js';

describe('Hook System Integration', () => {
  let tempDir: string;
  let registry: HookRegistry;
  let hookPort: CompositeHookPort;

  beforeEach(async () => {
    // Create temp directory for test scripts
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hook-integration-'));
    registry = new HookRegistry();
    hookPort = new CompositeHookPort(registry);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createContext = (overrides?: Partial<HookContext>): HookContext => ({
    sessionId: 'test-session',
    conversationId: 'test-convo',
    messageId: 'test-msg',
    hookEvent: HookEventTypes.PreToolUse,
    cwd: tempDir,
    toolName: 'bash_tool',
    ...overrides,
  });

  it('should execute full flow: frontmatter → registry → hook execution', async () => {
    // 1. Create a test hook script
    const hookScript = path.join(tempDir, 'pre-tool-hook.sh');
    await fs.writeFile(hookScript, `#!/bin/bash
echo '{"continue": true, "additionalContext": "hook executed successfully"}'
`, { mode: 0o755 });

    // 2. Simulate agent frontmatter
    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          { 
            matcher: 'bash_tool',
            command: { 
              command: hookScript,
              timeout: 10,
            },
          },
        ],
      },
    };

    // 3. Load hooks from frontmatter and register
    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    // 4. Execute hook via composite port
    const context = createContext();
    const result = await hookPort.executeHook(context);

    // 5. Verify result
    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.additionalContext).toBe('hook executed successfully');
  });

  it('should block tool execution when hook returns continue:false', async () => {
    // Hook that blocks execution
    const hookScript = path.join(tempDir, 'block-hook.sh');
    await fs.writeFile(hookScript, `#!/bin/bash
echo '{"continue": false, "stopReason": "dangerous command detected"}'
exit 2
`, { mode: 0o755 });

    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          { 
            matcher: 'bash_tool',
            command: { command: hookScript },
          },
        ],
      },
    };

    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    const context = createContext();
    const result = await hookPort.executeHook(context);

    expect(result.continue).toBe(false);
    expect(result.exitCode).toBe(2);
  });

  it('should modify tool input via hook', async () => {
    // Hook that modifies input
    const hookScript = path.join(tempDir, 'modify-hook.sh');
    await fs.writeFile(hookScript, `#!/bin/bash
echo '{"continue": true, "updatedInput": {"cmd": "sanitized-command", "safe": true}}'
`, { mode: 0o755 });

    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          { 
            command: { command: hookScript },
          },
        ],
      },
    };

    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    const context = createContext({
      toolInput: { cmd: 'original-command' },
    });
    const result = await hookPort.executeHook(context);

    expect(result.continue).toBe(true);
    expect(result.updatedInput).toEqual({ cmd: 'sanitized-command', safe: true });
  });

  it('should execute hooks for different event types', async () => {
    // Create hook scripts that write to a tracking file
    const trackFile = path.join(tempDir, 'track.txt');
    
    const preToolHook = path.join(tempDir, 'pre-tool.sh');
    await fs.writeFile(preToolHook, `#!/bin/bash
echo "pre_tool_use" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const postToolHook = path.join(tempDir, 'post-tool.sh');
    await fs.writeFile(postToolHook, `#!/bin/bash
echo "post_tool_use" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const sessionStartHook = path.join(tempDir, 'session-start.sh');
    await fs.writeFile(sessionStartHook, `#!/bin/bash
echo "session_start" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [{ command: { command: preToolHook } }],
        post_tool_use: [{ command: { command: postToolHook } }],
        session_start: [{ command: { command: sessionStartHook } }],
      },
    };

    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    // Execute different event types
    await hookPort.executeHook(createContext({ hookEvent: HookEventTypes.SessionStart }));
    await hookPort.executeHook(createContext({ hookEvent: HookEventTypes.PreToolUse }));
    await hookPort.executeHook(createContext({ hookEvent: HookEventTypes.PostToolUse }));

    // Verify all hooks ran
    const trackContent = await fs.readFile(trackFile, 'utf-8');
    expect(trackContent).toContain('session_start');
    expect(trackContent).toContain('pre_tool_use');
    expect(trackContent).toContain('post_tool_use');
  });

  it('should match hooks by tool name pattern', async () => {
    const trackFile = path.join(tempDir, 'matched.txt');

    const bashHook = path.join(tempDir, 'bash-hook.sh');
    await fs.writeFile(bashHook, `#!/bin/bash
echo "bash_matched" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const fileHook = path.join(tempDir, 'file-hook.sh');
    await fs.writeFile(fileHook, `#!/bin/bash
echo "file_matched" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [
          { matcher: 'bash_tool', command: { command: bashHook } },
          { matcher: 'file_read|file_edit', command: { command: fileHook } },
        ],
      },
    };

    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    // Execute with bash_tool - should only match bash hook
    await hookPort.executeHook(createContext({ toolName: 'bash_tool' }));

    // Execute with file_read - should only match file hook
    await hookPort.executeHook(createContext({ toolName: 'file_read' }));

    const trackContent = await fs.readFile(trackFile, 'utf-8');
    const lines = trackContent.trim().split('\n');
    
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('bash_matched');
    expect(lines[1]).toBe('file_matched');
  });

  it('should support multiple hook sources (agent + global)', async () => {
    const trackFile = path.join(tempDir, 'sources.txt');

    const agentHook = path.join(tempDir, 'agent-hook.sh');
    await fs.writeFile(agentHook, `#!/bin/bash
echo "agent" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const globalHook = path.join(tempDir, 'global-hook.sh');
    await fs.writeFile(globalHook, `#!/bin/bash
echo "global" >> ${trackFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    // Register hooks from different sources
    const agentFrontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [{ command: { command: agentHook } }],
      },
    };
    registry.register('my-agent', loadHooksFromFrontmatter(agentFrontmatter));

    const globalHooks: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [{ command: { command: globalHook } }],
      },
    };
    registry.register('global', loadHooksFromFrontmatter(globalHooks));

    // Execute - both hooks should run
    await hookPort.executeHook(createContext());

    const trackContent = await fs.readFile(trackFile, 'utf-8');
    expect(trackContent).toContain('agent');
    expect(trackContent).toContain('global');
  });

  it('should pass NUVIN_ environment variables to hook scripts', async () => {
    const outputFile = path.join(tempDir, 'env.txt');
    
    const envHook = path.join(tempDir, 'env-hook.sh');
    await fs.writeFile(envHook, `#!/bin/bash
echo "$NUVIN_SESSION_ID,$NUVIN_TOOL_NAME,$NUVIN_HOOK_EVENT" > ${outputFile}
echo '{"continue": true}'
`, { mode: 0o755 });

    const frontmatter: AgentFrontmatter = {
      hooks: {
        pre_tool_use: [{ command: { command: envHook } }],
      },
    };

    const hooksConfig = loadHooksFromFrontmatter(frontmatter);
    registry.register('test-agent', hooksConfig);

    const context = createContext({
      sessionId: 'my-session',
      toolName: 'my_tool',
      hookEvent: HookEventTypes.PreToolUse,
    });
    await hookPort.executeHook(context);

    const envContent = await fs.readFile(outputFile, 'utf-8');
    expect(envContent.trim()).toBe('my-session,my_tool,pre_tool_use');
  });
});
