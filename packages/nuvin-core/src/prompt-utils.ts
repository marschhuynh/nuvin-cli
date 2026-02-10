export type TemplateVars = Record<string, string | number | boolean | null | undefined>;

// Very small mustache-like renderer: replaces {{var}} with provided values.
// Unknown variables are left untouched.
export function renderTemplate(template: string, vars: TemplateVars): string {
  if (!template) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

export type InjectedSystemParams = {
  today: string;
  platform: string;
  arch: string;
  tempDir: string;
  workspaceDir: string;
  availableAgents?: Array<{ id: string; name: string; description: string }>;
  folderTree?: string;
  shell?: string;
  gitBranch?: string;
  gitRepo?: string;
  recentCommits?: string;
};

export function buildInjectedSystem(
  p: InjectedSystemParams,
  { withSubAgent }: { withSubAgent?: boolean } = { withSubAgent: false },
): string {
  const parts = [
    'System info:',
    `- Today's date: ${p.today}`,
    `- Platform: ${p.platform} ${p.arch}`,
    `- Temp: ${p.tempDir}`,
    `- Working directory: ${p.workspaceDir}`,
  ];

  if (p.shell) {
    parts.push(`- Shell: ${p.shell}`);
  }

  if (p.gitBranch || p.gitRepo) {
    parts.push('');
    parts.push('Git info:');
    if (p.gitRepo) {
      parts.push(`- Repository: ${p.gitRepo}`);
    }
    if (p.gitBranch) {
      parts.push(`- Branch: ${p.gitBranch}`);
    }
  }

  if (p.recentCommits) {
    parts.push('');
    parts.push('Recent commits:');
    parts.push(p.recentCommits);
  }

  if (p.folderTree) {
    parts.push('');
    parts.push('Folder structure:');
    parts.push(p.folderTree);
  }

  if (p.availableAgents && p.availableAgents.length > 0 && withSubAgent) {
    parts.push('');
    parts.push('Available specialist agents (use assign_task tool to delegate):');
    for (const agent of p.availableAgents) {
      parts.push(`- ${agent.id}: ${agent.description}`);
    }
  }

  return parts.join('\n');
}
