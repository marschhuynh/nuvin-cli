import { commandRegistry } from '@/modules/commands/registry.js';

export function findCommandCompletion(input: string, cursorOffset: number): string | null {
  const textBeforeCursor = input.slice(0, cursorOffset);
  const lastWordMatch = textBeforeCursor.match(/\/(\w*)$/);

  if (!lastWordMatch) {
    return null;
  }

  const partialCommand = lastWordMatch[1];

  // Don't complete empty partial command (just "/")
  if (partialCommand === '') {
    return null;
  }

  const commands = commandRegistry.list();

  const matchingCommands = commands.filter((cmd) =>
    cmd.id.toLowerCase().startsWith(`/${partialCommand.toLowerCase()}`),
  );

  if (matchingCommands.length === 1) {
    return matchingCommands[0].id;
  }

  if (matchingCommands.length > 1) {
    return matchingCommands[0].id;
  }

  return null;
}

export function completeCommand(
  input: string,
  cursorOffset: number,
  completedCommand: string,
): { newValue: string; newCursorOffset: number } {
  const textBeforeCursor = input.slice(0, cursorOffset);
  const lastWordMatch = textBeforeCursor.match(/\/(\w*)$/);

  if (!lastWordMatch) {
    return { newValue: input, newCursorOffset: cursorOffset };
  }

  const beforePartial = textBeforeCursor.slice(0, lastWordMatch.index);
  const newTextBeforeCursor = beforePartial + completedCommand + ' ';
  const textAfterCursor = input.slice(cursorOffset);

  return {
    newValue: newTextBeforeCursor + textAfterCursor,
    newCursorOffset: newTextBeforeCursor.length,
  };
}
