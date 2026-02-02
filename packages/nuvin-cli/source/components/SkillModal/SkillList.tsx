import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import type { SkillInfo } from '@/types/skills.js';

interface SkillListProps {
  skills: SkillInfo[];
  isSkillEnabled: (name: string) => boolean;
  onSkillSelect: (index: number) => void;
  onToggle?: (name: string) => void;
  onEdit?: (name: string) => void;
  focus?: boolean;
}

export const SkillList: React.FC<SkillListProps> = ({
  skills,
  isSkillEnabled,
  onSkillSelect,
  onToggle,
  onEdit,
  focus = true,
}) => {
  const { theme } = useTheme();

  const getEnabledCount = () => {
    return skills.filter((skill) => isSkillEnabled(skill.name)).length;
  };

  const comboBoxItems = useMemo<ComboBoxItem[]>(
    () =>
      skills.map((skill) => ({
        label: skill.name,
        value: skill.name,
      })),
    [skills],
  );

  const renderSkillItem = useCallback(
    (item: ComboBoxItem, isSelected: boolean) => {
      const skill = skills.find((s) => s.name === item.value);
      if (!skill) return null;

      const enabled = isSkillEnabled(skill.name);
      const statusColor = enabled ? theme.tokens.green : theme.tokens.red;
      const statusIcon = enabled ? '✓' : '✗';
      const accentColor = theme.colors.accent;

      const isGlobal = skill.location.includes('/.claude/') || skill.location.includes('/.nuvin/');

      const extendedSkill = skill as SkillInfo & {
        license?: string;
        compatibility?: string;
        allowedTools?: string[];
        hasScripts?: boolean;
        hasReferences?: boolean;
        hasAssets?: boolean;
      };

      const params: React.ReactNode[] = [];

      if (extendedSkill.license) {
        params.push(
          <Text key="license">
            <Text dimColor>license: </Text>
            <Text color="white">{extendedSkill.license}</Text>
          </Text>,
        );
      }
      if (extendedSkill.compatibility) {
        params.push(
          <Text key="compatibility">
            <Text dimColor>compatibility: </Text>
            <Text color="white">{extendedSkill.compatibility}</Text>
          </Text>,
        );
      }
      if (extendedSkill.allowedTools && extendedSkill.allowedTools.length > 0) {
        params.push(
          <Text key="allowed_tools">
            <Text dimColor>allowed_tools: </Text>
            <Text color="white">{extendedSkill.allowedTools.join(', ')}</Text>
          </Text>,
        );
      }
      if (extendedSkill.hasScripts) {
        params.push(
          <Text key="has_scripts">
            <Text dimColor>has_scripts: </Text>
            <Text color="white">true</Text>
          </Text>,
        );
      }
      if (extendedSkill.hasReferences) {
        params.push(
          <Text key="has_references">
            <Text dimColor>has_references: </Text>
            <Text color="white">true</Text>
          </Text>,
        );
      }
      if (extendedSkill.hasAssets) {
        params.push(
          <Text key="has_assets">
            <Text dimColor>has_assets: </Text>
            <Text color="white">true</Text>
          </Text>,
        );
      }

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={statusColor} bold>
              {statusIcon}
            </Text>
            <Text> </Text>
            <Text color={isSelected ? accentColor : undefined}>{isSelected ? '› ' : '  '}</Text>
            <Text color={isSelected ? accentColor : 'white'} bold={isSelected}>
              {skill.name}
            </Text>
            <Text dimColor> </Text>
            <Text color={isGlobal ? theme.tokens.yellow : theme.tokens.cyan} dimColor>
              [{isGlobal ? 'global' : 'local'}]
            </Text>
          </Box>
          {isSelected && (
            <Box flexDirection="column">
              <Box
                marginLeft={4}
                borderStyle={'single'}
                borderTop={false}
                borderBottom={false}
                borderRight={false}
                borderLeft
                borderDimColor
                paddingX={1}
              >
                <Text dimColor wrap="wrap">
                  {skill.description}
                </Text>
              </Box>
              <Box marginLeft={4}>
                <Text dimColor wrap="wrap">
                  └─{' '}
                </Text>
                {params.length > 0 &&
                  params.map((param, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: params may contain duplicates
                    <Text key={i}>
                      {param}
                      {i < params.length - 1 && <Text dimColor> - </Text>}
                    </Text>
                  ))}
              </Box>
            </Box>
          )}
        </Box>
      );
    },
    [skills, isSkillEnabled, theme],
  );

  const handleSelect = useCallback(
    (item: ComboBoxItem) => {
      const skill = skills.find((s) => s.name === item.value);
      if (skill) {
        onEdit?.(skill.name);
      }
    },
    [skills, onEdit],
  );

  const handleSpace = useCallback(
    (item: ComboBoxItem) => {
      const skill = skills.find((s) => s.name === item.value);
      if (skill) {
        onToggle?.(skill.name);
      }
    },
    [skills, onToggle],
  );

  const handleHighlight = useCallback(
    (_item: ComboBoxItem | null, index: number) => {
      onSkillSelect(index);
    },
    [onSkillSelect],
  );

  return (
    <Box flexDirection="column" width="100%" flexGrow={1} overflow="hidden">
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.tokens.cyan} bold>
          Skills ({getEnabledCount()}/{skills.length})
        </Text>
      </Box>

      <ComboBox
        items={comboBoxItems}
        placeholder="Search skills..."
        enableRotation={true}
        showItemCount={false}
        focus={focus}
        renderItem={renderSkillItem}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        onSpace={handleSpace}
      />
    </Box>
  );
};
