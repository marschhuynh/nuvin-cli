import { useState, useEffect } from 'react';
import type { SkillInfo } from '@/types/skills.js';

export interface SkillModalState {
  selectedSkillIndex: number;
  localEnabledSkills: Record<string, boolean>;
}

export interface SkillModalActions {
  setSelectedSkillIndex: (index: number) => void;
  toggleSkill: (skillName: string) => void;
  isSkillEnabled: (skillName: string) => boolean;
  getEnabledCount: (skills: SkillInfo[]) => number;
}

export const useSkillModalState = (
  skills: SkillInfo[],
  enabledSkills: Record<string, boolean> = {},
  initialSelectedIndex?: number,
) => {
  const [selectedSkillIndex, setSelectedSkillIndex] = useState(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < skills.length) {
      return initialSelectedIndex;
    }
    return 0;
  });
  const [localEnabledSkills, setLocalEnabledSkills] = useState<Record<string, boolean>>(() => ({ ...enabledSkills }));

  useEffect(() => {
    setLocalEnabledSkills({ ...enabledSkills });
  }, [enabledSkills]);

  useEffect(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < skills.length) {
      setSelectedSkillIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex, skills.length]);

  useEffect(() => {
    if (skills.length === 0) {
      setSelectedSkillIndex(0);
    } else if (selectedSkillIndex >= skills.length) {
      setSelectedSkillIndex(Math.max(0, skills.length - 1));
    }
  }, [skills.length, selectedSkillIndex]);

  const toggleSkill = (skillName: string) => {
    const newEnabledSkills = { ...localEnabledSkills };
    const currentValue = newEnabledSkills[skillName];
    newEnabledSkills[skillName] = currentValue === false;
    setLocalEnabledSkills(newEnabledSkills);
  };

  const isSkillEnabled = (skillName: string) => {
    return localEnabledSkills[skillName] !== false;
  };

  const getEnabledCount = (skills: SkillInfo[]) => {
    return skills.filter((skill) => isSkillEnabled(skill.name)).length;
  };

  return {
    selectedSkillIndex,
    localEnabledSkills,
    setSelectedSkillIndex,
    toggleSkill,
    isSkillEnabled,
    getEnabledCount,
  };
};
