import test from 'ava';
import { cleanTerminalCopy } from './utils.js';

test('cleanTerminalCopy removes ANSI escape sequences', (t) => {
  // Basic ANSI color codes
  const coloredText = '\u001b[31mRed text\u001b[0m';
  const result = cleanTerminalCopy(coloredText);
  t.is(result, 'Red text');
});

test('cleanTerminalCopy removes complex ANSI sequences', (t) => {
  // Multiple ANSI sequences
  const complexText = '\u001b[1;31mBold Red\u001b[0m \u001b[32mGreen\u001b[0m \u001b[4mUnderlined\u001b[0m';
  const result = cleanTerminalCopy(complexText);
  t.is(result, 'Bold Red Green Underlined');
});

test('cleanTerminalCopy removes cursor movement sequences', (t) => {
  // Cursor positioning
  const cursorText = 'Hello\u001b[2J\u001b[H World';
  const result = cleanTerminalCopy(cursorText);
  t.is(result, 'Hello World');
});

test('slash command autocomplete with tab', (t) => {
  const commandItems = [
    { label: 'Export', value: '/export' },
    { label: 'Import', value: '/import' },
    { label: 'Help', value: '/help' },
  ];

  const input = '/exp';
  const inputParts = input.split(/\s+/);
  const commandPart = inputParts[0];
  const args = inputParts.slice(1).join(' ');

  const matches = commandItems.filter((item) => item.value.toLowerCase().startsWith(commandPart.toLowerCase()));

  t.is(matches.length, 1);
  t.is(matches[0].value, '/export');

  const completed = args ? `${matches[0].value} ${args}` : matches[0].value;
  t.is(completed, '/export');

  // Ensure test runner is working
  t.pass();
});

test('cleanTerminalCopy removes OSC sequences with BEL terminator', (t) => {
  // OSC sequence terminated with BEL
  const oscText = 'Before\u001b]0;Window Title\u0007After';
  const result = cleanTerminalCopy(oscText);
  t.is(result, 'BeforeAfter');
});

test('cleanTerminalCopy removes OSC sequences with ST terminator', (t) => {
  // OSC sequence terminated with ST (ESC \)
  const oscText = 'Before\u001b]0;Window Title\u001b\\After';
  const result = cleanTerminalCopy(oscText);
  t.is(result, 'BeforeAfter');
});

test('cleanTerminalCopy removes DCS sequences', (t) => {
  // DCS (Device Control String) sequence
  const dcsText = 'Before\u001bP1$t\u001b\\After';
  const result = cleanTerminalCopy(dcsText);
  t.is(result, 'BeforeAfter');
});

test('cleanTerminalCopy removes PM sequences', (t) => {
  // PM (Privacy Message) sequence
  const pmText = 'Before\u001b^some data\u001b\\After';
  const result = cleanTerminalCopy(pmText);
  t.is(result, 'BeforeAfter');
});

test('cleanTerminalCopy removes APC sequences', (t) => {
  // APC (Application Program Command) sequence
  const apcText = 'Before\u001b_some command\u001b\\After';
  const result = cleanTerminalCopy(apcText);
  t.is(result, 'BeforeAfter');
});

test('cleanTerminalCopy removes bracketed paste markers', (t) => {
  // Bracketed paste mode markers
  const pasteText = 'Normal\u001b[200~Pasted content\u001b[201~Normal';
  const result = cleanTerminalCopy(pasteText);
  t.is(result, 'NormalPasted contentNormal');
});

test('cleanTerminalCopy removes zero-width characters', (t) => {
  // Various zero-width characters
  const zwText = 'Hello\u200bWorld\u200c!\u200d Test\u2060End\u00A0Space';
  const result = cleanTerminalCopy(zwText);
  t.is(result, 'HelloWorld! TestEndSpace');
});

test('cleanTerminalCopy normalizes line endings', (t) => {
  // Windows line endings
  const windowsText = 'Line 1\r\nLine 2\r\nLine 3';
  const result = cleanTerminalCopy(windowsText);
  t.is(result, 'Line 1\nLine 2\nLine 3');

  // Old Mac line endings
  const macText = 'Line 1\rLine 2\rLine 3';
  const macResult = cleanTerminalCopy(macText);
  t.is(macResult, 'Line 1\nLine 2\nLine 3');

  // Mixed line endings
  const mixedText = 'Line 1\r\nLine 2\rLine 3\nLine 4';
  const mixedResult = cleanTerminalCopy(mixedText);
  t.is(mixedResult, 'Line 1\nLine 2\nLine 3\nLine 4');
});

test('cleanTerminalCopy handles complex real-world terminal output', (t) => {
  // Simulate complex terminal output with colors, cursor movements, and mixed content
  const complexOutput = [
    '\u001b[2J\u001b[H', // Clear screen and move cursor to home
    '\u001b[1;32m✓\u001b[0m Test passed\r\n',
    '\u001b[1;31m✗\u001b[0m Test failed\r\n',
    '\u001b]0;Terminal Title\u0007',
    '\u001b[33mWarning:\u001b[0m Something happened\u200b\r\n',
    'Normal text\u001b[200~copied content\u001b[201~more text',
  ].join('');

  const result = cleanTerminalCopy(complexOutput);
  const expected = '✓ Test passed\n✗ Test failed\nWarning: Something happened\nNormal textcopied contentmore text';
  t.is(result, expected);
});

test('cleanTerminalCopy preserves regular text', (t) => {
  // Plain text should remain unchanged
  const plainText = 'This is just regular text with numbers 123 and symbols !@#$%';
  const result = cleanTerminalCopy(plainText);
  t.is(result, plainText);
});

test('cleanTerminalCopy handles empty strings', (t) => {
  const result = cleanTerminalCopy('');
  t.is(result, '');
});

test('cleanTerminalCopy handles strings with only ANSI codes', (t) => {
  const onlyAnsi = '\u001b[31m\u001b[0m\u001b[32m\u001b[0m';
  const result = cleanTerminalCopy(onlyAnsi);
  t.is(result, '');
});

test('cleanTerminalCopy handles Unicode content', (t) => {
  // Unicode characters should be preserved (except zero-width ones)
  const unicodeText = 'Hello 🌍 World 中文 العربية русский';
  const result = cleanTerminalCopy(unicodeText);
  t.is(result, unicodeText);
});

test('cleanTerminalCopy handles malformed ANSI sequences gracefully', (t) => {
  // Incomplete or malformed sequences should not cause issues
  const malformedText = 'Text\u001b[incomplete sequence and \u001b normal text';
  const result = cleanTerminalCopy(malformedText);
  // Should at least not crash and preserve the readable parts
  t.true(result.includes('Text'));
  t.true(result.includes('normal text'));
});
