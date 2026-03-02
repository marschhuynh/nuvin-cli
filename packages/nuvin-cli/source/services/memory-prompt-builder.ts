const MEMORY_START_MARKER = '<!-- nuvin:memory:start -->';
const MEMORY_END_MARKER = '<!-- nuvin:memory:end -->';

export function stripInjectedMemorySection(systemPrompt: string): string {
  const withMarkersRemoved = systemPrompt.replace(
    /<!-- nuvin:memory:start -->[\s\S]*?<!-- nuvin:memory:end -->\n?/g,
    '',
  );
  return withMarkersRemoved.replace(/\n\n## Long-Term Memory[\s\S]*$/g, '').trimEnd();
}

export function buildSystemPromptWithMemory(baseSystemPrompt: string, memorySection: string): string {
  const stripped = stripInjectedMemorySection(baseSystemPrompt);
  const trimmedSection = memorySection.trim();
  if (trimmedSection.length === 0) return stripped;
  return `${stripped}\n\n${MEMORY_START_MARKER}\n${trimmedSection}\n${MEMORY_END_MARKER}`;
}

export { MEMORY_START_MARKER, MEMORY_END_MARKER };
