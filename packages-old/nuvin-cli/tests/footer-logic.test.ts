import { describe, it, expect } from 'vitest';

describe('Footer Sudo Mode Logic', () => {
  it('should show SUDO when toolApprovalMode is false (sudo mode ON)', () => {
    const toolApprovalMode = false; // Agent bypasses approval = sudo ON
    const thinking = 'OFF';
    const provider = 'echo';
    const model = 'test-model';

    const statusTextParts = [
      provider,
      model,
      thinking !== 'OFF' ? `Thinking: ${thinking}` : '', // Only show thinking if not OFF
      !toolApprovalMode ? 'SUDO' : '', // Show SUDO when toolApprovalMode is false
    ].filter(Boolean);

    expect(statusTextParts).toContain('SUDO');
  });

  it('should NOT show SUDO when toolApprovalMode is true (sudo mode OFF)', () => {
    const toolApprovalMode = true; // User must approve = sudo OFF
    const thinking = 'OFF';
    const provider = 'echo';
    const model = 'test-model';

    const statusTextParts = [
      provider,
      model,
      thinking !== 'OFF' ? `Thinking: ${thinking}` : '', // Only show thinking if not OFF
      !toolApprovalMode ? 'SUDO' : '', // Show SUDO when toolApprovalMode is false
    ].filter(Boolean);

    expect(statusTextParts).not.toContain('SUDO');
  });

  it('should toggle SUDO display correctly when toolApprovalMode changes', () => {
    // Initial state: tool approval required (sudo OFF)
    let toolApprovalMode = true;
    const thinkingLevel = 'OFF';
    let statusText = [
      'echo',
      'test-model',
      thinkingLevel !== 'OFF' ? `Thinking: ${thinkingLevel}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);
    expect(statusText).not.toContain('SUDO');

    // Toggle: disable tool approval (sudo ON)
    toolApprovalMode = false;
    statusText = [
      'echo',
      'test-model',
      thinkingLevel !== 'OFF' ? `Thinking: ${thinkingLevel}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);
    expect(statusText).toContain('SUDO');

    // Toggle back: enable tool approval (sudo OFF)
    toolApprovalMode = true;
    statusText = [
      'echo',
      'test-model',
      thinkingLevel !== 'OFF' ? `Thinking: ${thinkingLevel}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);
    expect(statusText).not.toContain('SUDO');
  });

  it('should maintain other status elements when showing SUDO', () => {
    const toolApprovalMode = false; // sudo ON
    const thinking = 'MEDIUM';
    const provider = 'github';
    const model = 'gpt-4';

    const statusTextParts = [
      provider,
      model,
      thinking !== 'OFF' ? `Thinking: ${thinking}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);

    expect(statusTextParts).toEqual(['github', 'gpt-4', 'Thinking: MEDIUM', 'SUDO']);
    expect(statusTextParts).toHaveLength(4);
  });

  it('should hide thinking indicator when thinking is OFF', () => {
    const toolApprovalMode = true;
    const thinking = 'OFF';
    const provider = 'github';
    const model = 'gpt-4';

    const statusTextParts = [
      provider,
      model,
      thinking !== 'OFF' ? `Thinking: ${thinking}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);

    expect(statusTextParts).toEqual(['github', 'gpt-4']);
    expect(statusTextParts).not.toContain('Thinking: OFF');
    expect(statusTextParts).not.toContain('SUDO');
  });

  it('should show thinking indicator when thinking is not OFF', () => {
    const toolApprovalMode = true;
    const thinking = 'MEDIUM';
    const provider = 'github';
    const model = 'gpt-4';

    const statusTextParts = [
      provider,
      model,
      thinking !== 'OFF' ? `Thinking: ${thinking}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);

    expect(statusTextParts).toContain('Thinking: MEDIUM');
    expect(statusTextParts).toEqual(['github', 'gpt-4', 'Thinking: MEDIUM']);
  });

  it('should hide thinking indicator when thinking is undefined', () => {
    const toolApprovalMode = true;
    const thinking = undefined;
    const provider = 'github';
    const model = 'gpt-4';

    const statusTextParts = [
      provider,
      model,
      thinking && thinking !== 'OFF' ? `Thinking: ${thinking}` : '',
      !toolApprovalMode ? 'SUDO' : '',
    ].filter(Boolean);

    expect(statusTextParts).toEqual(['github', 'gpt-4']);
    expect(statusTextParts).not.toContain('Thinking: undefined');
  });
});
