import { useState, useCallback, useEffect } from 'react';
import type { AgentTemplate } from '@nuvin/nuvin-core';

type EditingField = 'name' | 'id' | 'description' | 'systemPrompt' | 'tools' | 'model' | 'temperature';
type ViewMode = 'input' | 'preview' | 'editing' | 'loading' | 'error';
type EditFormView = 'basic' | 'systemPrompt';

const editingSequence: EditingField[] = ['name', 'id', 'model', 'temperature', 'tools', 'description'];

export interface AgentCreationState {
  mode: 'create' | 'edit';
  viewMode: ViewMode;
  editFormView: EditFormView;
  description: string;
  showPreview: boolean;
  isEditing: boolean;
  activeField: EditingField;
  editedName: string;
  editedId: string;
  editedDescription: string;
  editedTools: string[];
  editedTemperature: string;
  editedSystemPrompt: string;
  editedModel: string;
}

export interface AgentCreationActions {
  setDescription: (description: string) => void;
  setShowPreview: (show: boolean) => void;
  setIsEditing: (editing: boolean) => void;
  setActiveField: (field: EditingField) => void;
  setEditedName: (name: string) => void;
  setEditedId: (id: string) => void;
  setEditedDescription: (description: string) => void;
  setEditedTools: (tools: string[]) => void;
  setEditedTemperature: (temperature: string) => void;
  setEditedSystemPrompt: (systemPrompt: string) => void;
  setEditedModel: (model: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setEditFormView: (view: EditFormView) => void;
  navigateToSystemPrompt: () => void;
  navigateToBasicForm: () => void;
  initializeEditingState: (preview?: Partial<AgentTemplate> & { systemPrompt: string }) => void;
  handleStartEditing: () => void;
  handleCancelEditing: () => void;
  moveFocus: (direction: 'next' | 'prev') => void;
  handleSaveEditedAgent: () => void;
  handleFieldSubmit: (field: EditingField) => void;
  handleSaveEditing: () => void;
  getUpdatedPreview: () => (Partial<AgentTemplate> & { systemPrompt: string }) | undefined;
}

export const useAgentCreationState = (
  mode: 'create' | 'edit',
  preview?: Partial<AgentTemplate> & { systemPrompt: string },
  onUpdatePreview?: (nextPreview: Partial<AgentTemplate> & { systemPrompt: string }) => void,
  onConfirm?: (nextPreview?: Partial<AgentTemplate> & { systemPrompt: string }) => void,
) => {
  const [description, setDescription] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('input');
  const [editFormView, setEditFormView] = useState<EditFormView>('basic');
  const [showPreview, setShowPreview] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeField, setActiveField] = useState<EditingField>('name');
  const [editedName, setEditedName] = useState('');
  const [editedId, setEditedId] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTools, setEditedTools] = useState<string[]>([]);
  const [editedTemperature, setEditedTemperature] = useState('');
  const [editedSystemPrompt, setEditedSystemPrompt] = useState('');
  const [editedModel, setEditedModel] = useState('');

  const navigateToSystemPrompt = useCallback(() => {
    setEditFormView('systemPrompt');
  }, []);

  const navigateToBasicForm = useCallback(() => {
    setEditFormView('basic');
  }, []);

  const initializeEditingState = useCallback(() => {
    if (!preview) return;

    setEditedName(preview.name ?? '');
    setEditedId(preview.id ?? '');
    setEditedDescription(preview.description ?? '');
    setEditedTools(Array.isArray(preview.tools) ? [...preview.tools] : []);
    setEditedTemperature(
      preview.temperature !== undefined && preview.temperature !== null ? String(preview.temperature) : '',
    );
    setEditedSystemPrompt(preview.systemPrompt ?? '');
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

    setEditedSystemPrompt(preview.systemPrompt ?? '');
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
    const normalizedId = editedId.trim();
    const normalizedDescription = editedDescription.trim();
    const normalizedTemperature = editedTemperature.trim();
    const normalizedSystemPrompt = editedSystemPrompt.trim();
    const normalizedModel = editedModel.trim();

    const parsedTemperature = Number(normalizedTemperature);
    const temperature =
      normalizedTemperature.length === 0 || Number.isNaN(parsedTemperature)
        ? undefined
        : Math.min(2, Math.max(0, parsedTemperature));

    const nextId = normalizedId.length > 0 ? normalizedId : mode === 'edit' ? preview.id : undefined;
    const nextSystemPrompt = normalizedSystemPrompt.length > 0 ? normalizedSystemPrompt : (preview.systemPrompt ?? '');

    const updatedPreview: Partial<AgentTemplate> & { systemPrompt: string } = {
      ...preview,
      name: normalizedName.length > 0 ? normalizedName : preview.name,
      id: nextId,
      description: normalizedDescription.length > 0 ? normalizedDescription : undefined,
      tools: [...editedTools],
      temperature,
      systemPrompt: nextSystemPrompt,
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
    editedId,
    editedModel,
    editedName,
    editedSystemPrompt,
    editedTemperature,
    editedTools,
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
    const normalizedId = editedId.trim();
    const normalizedDescription = editedDescription.trim();
    const normalizedTemperature = editedTemperature.trim();
    const normalizedSystemPrompt = editedSystemPrompt.trim();
    const normalizedModel = editedModel.trim();

    const parsedTemperature = Number(normalizedTemperature);
    const temperature =
      normalizedTemperature.length === 0 || Number.isNaN(parsedTemperature)
        ? undefined
        : Math.min(2, Math.max(0, parsedTemperature));

    const nextId = normalizedId.length > 0 ? normalizedId : mode === 'edit' ? preview.id : undefined;
    const nextSystemPrompt = normalizedSystemPrompt.length > 0 ? normalizedSystemPrompt : (preview.systemPrompt ?? '');

    return {
      ...preview,
      name: normalizedName.length > 0 ? normalizedName : preview.name,
      id: nextId,
      description: normalizedDescription.length > 0 ? normalizedDescription : undefined,
      tools: [...editedTools],
      temperature,
      systemPrompt: nextSystemPrompt,
      model: normalizedModel.length > 0 ? normalizedModel : undefined,
    };
  }, [
    editedDescription,
    editedId,
    editedModel,
    editedName,
    editedSystemPrompt,
    editedTemperature,
    editedTools,
    mode,
    preview,
  ]);

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
    editedId,
    editedDescription,
    editedTools,
    editedTemperature,
    editedSystemPrompt,
    editedModel,
    setDescription,
    setShowPreview,
    setIsEditing,
    setActiveField,
    setEditedName,
    setEditedId,
    setEditedDescription,
    setEditedTools,
    setEditedTemperature,
    setEditedSystemPrompt,
    setEditedModel,
    setViewMode,
    setEditFormView,
    navigateToSystemPrompt,
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
