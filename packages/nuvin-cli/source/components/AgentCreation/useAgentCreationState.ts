import { useState, useCallback, useEffect } from 'react';
import type { AgentTemplate } from '@nuvin/nuvin-core';

type EditingField = 'name' | 'description' | 'instructions' | 'allowed_tools' | 'model' | 'temperature';
type ViewMode = 'input' | 'preview' | 'editing' | 'loading' | 'error';
type EditFormView = 'basic' | 'instructions';

const editingSequence: EditingField[] = ['name', 'model', 'temperature', 'allowed_tools', 'description'];

export interface AgentCreationState {
  mode: 'create' | 'edit';
  viewMode: ViewMode;
  editFormView: EditFormView;
  description: string;
  showPreview: boolean;
  isEditing: boolean;
  activeField: EditingField;
  editedName: string;
  editedDescription: string;
  editedAllowedTools: string[];
  editedTemperature: string;
  editedInstructions: string;
  editedModel: string;
}

export interface AgentCreationActions {
  setDescription: (description: string) => void;
  setShowPreview: (show: boolean) => void;
  setIsEditing: (editing: boolean) => void;
  setActiveField: (field: EditingField) => void;
  setEditedName: (name: string) => void;
  setEditedDescription: (description: string) => void;
  setEditedAllowedTools: (tools: string[]) => void;
  setEditedTemperature: (temperature: string) => void;
  setEditedInstructions: (instructions: string) => void;
  setEditedModel: (model: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setEditFormView: (view: EditFormView) => void;
  navigateToInstructions: () => void;
  navigateToBasicForm: () => void;
  initializeEditingState: (preview?: Partial<AgentTemplate> & { instructions: string }) => void;
  handleStartEditing: () => void;
  handleCancelEditing: () => void;
  moveFocus: (direction: 'next' | 'prev') => void;
  handleSaveEditedAgent: () => void;
  handleFieldSubmit: (field: EditingField) => void;
  handleSaveEditing: () => void;
  getUpdatedPreview: () => (Partial<AgentTemplate> & { instructions: string }) | undefined;
}

export const useAgentCreationState = (
  mode: 'create' | 'edit',
  preview?: Partial<AgentTemplate> & { instructions: string },
  onUpdatePreview?: (nextPreview: Partial<AgentTemplate> & { instructions: string }) => void,
  onConfirm?: (nextPreview?: Partial<AgentTemplate> & { instructions: string }) => void,
) => {
  const [description, setDescription] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [editFormView, setEditFormView] = useState<EditFormView>('basic');
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeField, setActiveField] = useState<EditingField>('name');
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedAllowedTools, setEditedAllowedTools] = useState<string[]>([]);
  const [editedTemperature, setEditedTemperature] = useState('');
  const [editedInstructions, setEditedInstructions] = useState('');
  const [editedModel, setEditedModel] = useState('');

  const navigateToInstructions = useCallback(() => {
    setEditFormView('instructions');
  }, []);

  const navigateToBasicForm = useCallback(() => {
    setEditFormView('basic');
  }, []);

  const initializeEditingState = useCallback(() => {
    if (!preview) return;

    setEditedName(preview.name ?? '');
    setEditedDescription(preview.description ?? '');
    setEditedAllowedTools(Array.isArray(preview.allowed_tools) ? [...preview.allowed_tools] : []);
    setEditedTemperature(
      preview.temperature !== undefined && preview.temperature !== null ? String(preview.temperature) : '',
    );
    setEditedInstructions(preview.instructions ?? '');
    setEditedModel(preview.model ?? '');
  }, [preview]);

  useEffect(() => {
    if (!preview) {
      setShowPreview(false);
      if (mode === 'edit') {
        setIsEditing(false);
      }
      return;
    }

    if (mode === 'edit') {
      initializeEditingState();
      setIsEditing(true);
      setShowPreview(false);
      setActiveField('name');
      setEditFormView('basic');
      return;
    }

    setEditedInstructions(preview.instructions ?? '');
    if (!isEditing) {
      setShowPreview(true);
    }
  }, [preview, mode, initializeEditingState, isEditing]);

  const handleStartEditing = useCallback(() => {
    if (!preview) return;

    initializeEditingState();
    setActiveField('name');
    setIsEditing(true);
    setShowPreview(false);
    setEditFormView('basic');
  }, [initializeEditingState, preview]);

  const handleCancelEditing = useCallback(() => {
    if (mode === 'edit') {
      return;
    }

    if (!preview) {
      setIsEditing(false);
      setShowPreview(false);
      return;
    }

    initializeEditingState();
    setIsEditing(false);
    setShowPreview(true);
    setActiveField('name');
  }, [initializeEditingState, mode, preview]);

  const moveFocus = useCallback((direction: 'next' | 'prev') => {
    setActiveField((current) => {
      const currentIndex = editingSequence.indexOf(current);
      if (currentIndex === -1) {
        return direction === 'next' ? editingSequence[0] : editingSequence[editingSequence.length - 1];
      }

      if (direction === 'next') {
        return editingSequence[Math.min(editingSequence.length - 1, currentIndex + 1)];
      }

      return editingSequence[Math.max(0, currentIndex - 1)];
    });
  }, []);

  const handleSaveEditedAgent = useCallback(() => {
    if (!preview || !onUpdatePreview) return;

    const normalizedName = editedName.trim();
    const normalizedDescription = editedDescription.trim();
    const normalizedTemperature = editedTemperature.trim();
    const normalizedInstructions = editedInstructions.trim();
    const normalizedModel = editedModel.trim();

    const parsedTemperature = Number(normalizedTemperature);
    const temperature =
      normalizedTemperature.length === 0 || Number.isNaN(parsedTemperature)
        ? undefined
        : Math.min(2, Math.max(0, parsedTemperature));

    const nextInstructions = normalizedInstructions.length > 0 ? normalizedInstructions : (preview.instructions ?? '');

    const updatedPreview: Partial<AgentTemplate> & { instructions: string } = {
      ...preview,
      name: normalizedName.length > 0 ? normalizedName : preview.name,
      description: normalizedDescription.length > 0 ? normalizedDescription : undefined,
      allowed_tools: [...editedAllowedTools],
      temperature,
      instructions: nextInstructions,
      model: normalizedModel.length > 0 ? normalizedModel : undefined,
    };

    onUpdatePreview(updatedPreview);
    if (mode === 'edit') {
      onConfirm?.(updatedPreview);
    } else {
      setIsEditing(false);
      setShowPreview(true);
      setActiveField('name');
    }
  }, [
    editedDescription,
    editedModel,
    editedName,
    editedInstructions,
    editedTemperature,
    editedAllowedTools,
    mode,
    onConfirm,
    onUpdatePreview,
    preview,
  ]);

  const handleFieldSubmit = useCallback((field: EditingField) => {
    const position = editingSequence.indexOf(field);
    if (position === -1) {
      return;
    }

    setActiveField(editingSequence[position + 1]);
  }, []);

  const getUpdatedPreview = useCallback(() => {
    if (!preview) return undefined;

    const normalizedName = editedName.trim();
    const normalizedDescription = editedDescription.trim();
    const normalizedTemperature = editedTemperature.trim();
    const normalizedInstructions = editedInstructions.trim();
    const normalizedModel = editedModel.trim();

    const parsedTemperature = Number(normalizedTemperature);
    const temperature =
      normalizedTemperature.length === 0 || Number.isNaN(parsedTemperature)
        ? undefined
        : Math.min(2, Math.max(0, parsedTemperature));

    const nextInstructions = normalizedInstructions.length > 0 ? normalizedInstructions : (preview.instructions ?? '');

    return {
      ...preview,
      name: normalizedName.length > 0 ? normalizedName : preview.name,
      description: normalizedDescription.length > 0 ? normalizedDescription : undefined,
      allowed_tools: [...editedAllowedTools],
      temperature,
      instructions: nextInstructions,
      model: normalizedModel.length > 0 ? normalizedModel : undefined,
    };
  }, [editedDescription, editedModel, editedName, editedInstructions, editedTemperature, editedAllowedTools, preview]);

  const handleSaveEditing = useCallback(() => {
    if (!preview || !onUpdatePreview) return;

    const updatedPreview = getUpdatedPreview();
    if (!updatedPreview) return;

    onUpdatePreview(updatedPreview);
    if (mode === 'edit') {
      onConfirm?.(updatedPreview);
    } else {
      setIsEditing(false);
      setShowPreview(true);
      setActiveField('name');
    }
  }, [getUpdatedPreview, mode, onConfirm, onUpdatePreview, preview]);

  return {
    mode,
    viewMode,
    editFormView,
    description,
    showPreview,
    isEditing,
    activeField,
    editedName,
    editedDescription,
    editedAllowedTools,
    editedTemperature,
    editedInstructions,
    editedModel,
    setDescription,
    setShowPreview,
    setIsEditing,
    setActiveField,
    setEditedName,
    setEditedDescription,
    setEditedAllowedTools,
    setEditedTemperature,
    setEditedInstructions,
    setEditedModel,
    setViewMode,
    setEditFormView,
    navigateToInstructions,
    navigateToBasicForm,
    initializeEditingState,
    handleStartEditing,
    handleCancelEditing,
    moveFocus,
    handleSaveEditedAgent,
    handleFieldSubmit,
    handleSaveEditing,
    getUpdatedPreview,
    editingSequence,
  };
};
