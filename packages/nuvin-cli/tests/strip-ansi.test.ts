import { describe, it, expect } from 'vitest';
import { stripAnsiAndControls } from '@nuvin/nuvin-core';

describe('stripAnsiAndControls', () => {
  it('removes basic ANSI color codes', () => {
    const input = '\u001b[31mRed text\u001b[0m';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('Red text');
  });

  it('removes CSI sequences', () => {
    const input = '\u001b[1;31mBold Red\u001b[0m';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('Bold Red');
  });

  it('removes OSC sequences with BEL', () => {
    const input = '\u001b]0;Window Title\u0007Normal text';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('Normal text');
  });

  it('removes OSC sequences with ST', () => {
    const input = '\u001b]0;Window Title\u001b\\Normal text';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('Normal text');
  });

  it('handles bash prompt output', () => {
    const input = 'git log -1 --oneline\u001b[?1h\u001b=\u001b[?2004h';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('git log -1 --oneline');
  });

  it('handles git output with ANSI', () => {
    const input = 'd517ef7 (HEAD → main, origin/main) feat: improve help text display\n\u001b[?2004l\r';
    const result = stripAnsiAndControls(input);
    expect(result).toContain('d517ef7');
    expect(result).toContain('feat: improve help text display');
  });

  it('handles shell prompt with icons', () => {
    const input = '⏎\u001b[0m\u001b]0;~/P/nuvin-space\u001b\\\r\nnuvin-space on  main [';
    const result = stripAnsiAndControls(input);
    // The ⏎ character (U+23CE) is a terminal visual indicator and should be removed
    expect(result).toBe('\r\nnuvin-space on  main [');
  });

  it('handles bash output with (B sequences', () => {
    const input = 'git\u001b(B log\u001b(B -1\u001b(B --oneline\u001b(B';
    const result = stripAnsiAndControls(input);
    expect(result).toBe('git log -1 --oneline');
  });

  it('handles complex bash session output', () => {
    const input = 'git log -1 --oneline\u001b(B log\u001b(B\n\u001b(B\u001b]0;git log\u001b(B=d517ef7 (HEAD → main)';
    const result = stripAnsiAndControls(input);
    expect(result).toContain('git log -1 --oneline');
    expect(result).toContain('d517ef7');
    expect(result).not.toContain('\u001b');
  });
});
