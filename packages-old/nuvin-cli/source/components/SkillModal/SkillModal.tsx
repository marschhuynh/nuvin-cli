import type React from 'react';
import { useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { SkillInfo } from '@/types/skills.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { useSkillModalState } from './useSkillModalState.js';
import { SkillList } from './SkillList.js';

const MODAL_HEIGHT = 30;

interface SkillModalProps {
  visible: boolean;
  skills: SkillInfo[];
  enabledSkills?: Record<string, boolean>;
  initialSelectedIndex?: number;
  onClose: () => void;
  onSkillStatusChange?: (name: string, enabled: boolean) => void;
  onSkillEdit?: (name: string) => void;
}

export const SkillConfigurationModal: React.FC<SkillModalProps> = ({
  visible,
  skills,
  enabledSkills = {},
  initialSelectedIndex,
  onClose,
  onSkillStatusChange,
  onSkillEdit,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const state = useSkillModalState(skills, enabledSkills, initialSelectedIndex);

  const handleToggle = useCallback(
    (name: string) => {
      const newValue = state.localEnabledSkills[name] === false;
      state.toggleSkill(name);
      onSkillStatusChange?.(name, newValue);
    },
    [state, onSkillStatusChange],
  );

  const handleView = useCallback(
    (name: string) => {
      onSkillEdit?.(name);
    },
    [onSkillEdit],
  );

  if (!visible) return null;

  const modalHeight = Math.min(MODAL_HEIGHT, rows - 4);

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓', highlight: true },
          { text: ' navigate • ' },
          { text: 'Ctrl+E', highlight: true },
          { text: ' toggle • ' },
          { text: 'Enter', highlight: true },
          { text: ' view • ' },
          { text: 'ESC', highlight: true },
          { text: ' exit' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={visible}
      title="Skills"
      closeOnEscape={true}
      closeOnEnter={false}
      onClose={onClose}
      paddingX={1}
      paddingY={0}
      footer={footerContent}
      height={modalHeight}
    >
      {skills.length === 0 ? (
        <Box marginX={1} flexDirection="column">
          <Text color={theme.history.help}>No skills found.</Text>
          <Text color={theme.colors.muted} dimColor>
            {'\n'}Skills are discovered from:
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • .claude/skills/ (project)
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • ~/.claude/skills/ (global)
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • .nuvin/skills/ (project)
          </Text>
          <Text color={theme.colors.muted} dimColor>
            • ~/.nuvin/skills/ (global)
          </Text>
        </Box>
      ) : (
        <SkillList
          skills={skills}
          isSkillEnabled={state.isSkillEnabled}
          onSkillSelect={state.setSelectedSkillIndex}
          onToggle={handleToggle}
          onEdit={handleView}
          focus={true}
        />
      )}
    </AppModal>
  );
};

export default SkillConfigurationModal;
