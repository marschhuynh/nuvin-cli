import { useCallback, useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { AppModal } from '@/components/AppModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { skillsService } from '@/services/SkillsService.js';
import type { SkillInfo, Skill, SkillDiscoveryError } from '@/types/skills.js';
import { SkillConfigurationModal } from '@/components/SkillModal/SkillModal.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

type ActiveView = 'list' | 'content';

const SkillsCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<SkillDiscoveryError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<ActiveView>('list');
  const [viewingSkill, setViewingSkill] = useState<Skill | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const loadSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      skillsService.reset();
      const result = await skillsService.discover(process.cwd());
      setSkills(Object.values(result.skills));
      setErrors(result.errors);

      const enabledConfig = (context.config.get('skillsEnabled') as Record<string, boolean>) || {};
      setEnabledSkills({ ...enabledConfig });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load skills: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [context.config]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleSkillStatusChange = useCallback(
    async (name: string, enabled: boolean) => {
      try {
        const currentConfig = (context.config.get('skillsEnabled') as Record<string, boolean>) || {};
        const updatedConfig = { ...currentConfig, [name]: enabled };

        await context.config.set('skillsEnabled', updatedConfig, 'global');
        setEnabledSkills(updatedConfig);
      } catch (err) {
        console.error('Failed to save skill status:', err);
      }
    },
    [context.config],
  );

  const handleSkillView = useCallback(
    async (name: string) => {
      const idx = skills.findIndex((s) => s.name === name);
      if (idx >= 0) setSelectedIndex(idx);

      const skill = await skillsService.loadFull(name);
      if (skill) {
        setViewingSkill(skill);
        setActiveView('content');
      }
    },
    [skills],
  );

  const handleBackToList = useCallback(() => {
    setActiveView('list');
    setViewingSkill(null);
  }, []);

  useInput(
    (_input, key) => {
      if (activeView === 'content') {
        if (key.escape) {
          handleBackToList();
        }
      }
    },
    { isActive: activeView === 'content' },
  );

  if (loading) {
    return (
      <AppModal visible={true} title="Skills" onClose={deactivate} closeOnEscape={true}>
        <Text color={theme.colors.warning}>Discovering skills...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="Skills"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  if (errors.length > 0) {
    console.warn(`Skill discovery had ${errors.length} errors`);
  }

  if (activeView === 'content' && viewingSkill) {
    const maxHeight = Math.max(5, rows - 12);

    return (
      <AppModal
        visible={true}
        title={`Skill: ${viewingSkill.name}`}
        onClose={handleBackToList}
        closeOnEscape={true}
        footer={
          <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
            <HelpText
              segments={[
                { text: 'j/k', highlight: true },
                { text: ' scroll • ' },
                { text: 'g/G', highlight: true },
                { text: ' top/bottom • ' },
                { text: 'ESC', highlight: true },
                { text: ' back' },
              ]}
            />
          </Box>
        }
        height="100%"
      >
        <Box flexDirection="column" flexGrow={1}>
          <Box marginBottom={1}>
            <Text dimColor>{viewingSkill.description}</Text>
          </Box>
          <AutoScrollBox maxHeight={maxHeight} showScrollbar focus={true} enableKeyboardScroll={true}>
            <Text>{viewingSkill.content || '*No content*'}</Text>
          </AutoScrollBox>
        </Box>
      </AppModal>
    );
  }

  return (
    <SkillConfigurationModal
      visible={true}
      skills={skills}
      enabledSkills={enabledSkills}
      initialSelectedIndex={selectedIndex}
      onClose={deactivate}
      onSkillStatusChange={handleSkillStatusChange}
      onSkillEdit={handleSkillView}
    />
  );
};

export function registerSkillsCommand(registry: CommandRegistry) {
  registry.register({
    id: '/skills',
    type: 'component',
    description: 'List and manage agent skills',
    category: 'config',
    component: SkillsCommandComponent,
  });
}
