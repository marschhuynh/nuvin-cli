import { useState, useCallback } from 'react';
import type { CommandSource, CustomCommandTemplate } from '@nuvin/nuvin-core';
import { sanitizeCommandId } from '@nuvin/nuvin-core';

export type FormView = 'basic' | 'prompt';

export interface UseCommandCreationStateOptions {
  mode: 'create' | 'edit';
  initialCommand?: Partial<CustomCommandTemplate>;
  availableScopes: CommandSource[];
}

export interface CommandCreationState {
  formView: FormView;
  editedName: string;
  editedDescription: string;
  editedScope: CommandSource;
  editedPrompt: string;
  error?: string;
  mode: 'create' | 'edit';
}

export interface CommandCreationActions {
  setEditedName: (value: string) => void;
  setEditedDescription: (value: string) => void;
  setEditedScope: (scope: CommandSource) => void;
  setEditedPrompt: (value: string) => void;
  setError: (error?: string) => void;
  handleFieldChange: (field: string, value: string) => void;
  handleScopeChange: (direction: 'left' | 'right') => void;
  navigateToPrompt: () => void;
  navigateToBasic: () => void;
  validate: () => boolean;
  getCommand: () => CustomCommandTemplate;
}

export const useCommandCreationState = (
  options: UseCommandCreationStateOptions
): CommandCreationState & CommandCreationActions => {
  const { mode, initialCommand, availableScopes } = options;

  const [formView, setFormView] = useState<FormView>('basic');
  const [editedName, setEditedName] = useState(initialCommand?.id || '');
  const [editedDescription, setEditedDescription] = useState(initialCommand?.description || '');
  const [editedScope, setEditedScope] = useState<CommandSource>(
    initialCommand?.source || (availableScopes.includes('local') ? 'local' : availableScopes[0] || 'global')
  );
  const [editedPrompt, setEditedPrompt] = useState(initialCommand?.prompt || '{{user_prompt}}');
  const [error, setError] = useState<string | undefined>();

  const handleFieldChange = useCallback((field: string, value: string) => {
    setError(undefined);
    switch (field) {
      case 'name':
        setEditedName(value);
        break;
      case 'description':
        setEditedDescription(value);
        break;
      case 'prompt':
        setEditedPrompt(value);
        break;
    }
  }, []);

  const handleScopeChange = useCallback((direction: 'left' | 'right') => {
    const currentIndex = availableScopes.indexOf(editedScope);
    let newIndex: number;
    
    if (direction === 'left') {
      newIndex = (currentIndex - 1 + availableScopes.length) % availableScopes.length;
    } else {
      newIndex = (currentIndex + 1) % availableScopes.length;
    }
    
    const newScope = availableScopes[newIndex];
    if (newScope) setEditedScope(newScope);
  }, [editedScope, availableScopes]);

  const navigateToPrompt = useCallback(() => {
    setFormView('prompt');
  }, []);

  const navigateToBasic = useCallback(() => {
    setFormView('basic');
  }, []);

  const validate = useCallback((): boolean => {
    if (!editedName.trim()) {
      setError('Command name is required');
      setFormView('basic');
      return false;
    }

    const sanitized = sanitizeCommandId(editedName);
    if (!sanitized) {
      setError('Invalid command name. Use lowercase letters, numbers, and hyphens.');
      setFormView('basic');
      return false;
    }

    if (!editedDescription.trim()) {
      setError('Description is required');
      setFormView('basic');
      return false;
    }

    if (!editedPrompt.trim()) {
      setError('Prompt template is required');
      setFormView('prompt');
      return false;
    }

    return true;
  }, [editedName, editedDescription, editedPrompt]);

  const getCommand = useCallback((): CustomCommandTemplate => {
    return {
      id: sanitizeCommandId(editedName),
      description: editedDescription.trim(),
      prompt: editedPrompt,
      source: editedScope,
      enabled: true,
    };
  }, [editedName, editedDescription, editedPrompt, editedScope]);

  return {
    formView,
    editedName,
    editedDescription,
    editedScope,
    editedPrompt,
    error,
    mode,
    setEditedName,
    setEditedDescription,
    setEditedScope,
    setEditedPrompt,
    setError,
    handleFieldChange,
    handleScopeChange,
    navigateToPrompt,
    navigateToBasic,
    validate,
    getCommand,
  };
};
