# Memory Config Command Implementation Plan

> **For Nuvin:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `/memory config` sub-command that opens a modal for configuring the memory extraction model, following the same UX as `/model` (flat grouped ComboBox of `provider::model` items).

**Architecture:** The existing `MemoryCommandComponent` in `memory.tsx` checks `rawInput` for the `config` arg and renders `MemoryConfigModal` instead of `MemoryModal`. `MemoryConfigModal` reuses the exact same provider+model ComboBox pattern from `models.tsx` — authenticated providers grouped, models listed under each — but on select it writes `memory.provider` and `memory.model` to config instead of `activeProvider`/`model`. A "Clear (use default)" option lets users reset to the smallModel fallback.

**Tech Stack:** React (Ink), AppModal, ComboBox, `config.set`, `LLMFactory.getModels`, `getAllProviders`, `getProviderLabel`

---

## Existing Patterns Reference

### How `/model` command builds its ComboBox items (`models.tsx`)
```tsx
// Groups: "Recent" section + one group per provider label
items.push({
  label: model,
  value: `${provider}::${model}`,  // "::"-separated key
  group: providerLabel,
});

// On select:
const [provider, model] = item.value.split('::');
await config.set('activeProvider', provider, 'global');
await config.set('model', model, 'global');
```

### Fetching models (`models.tsx` pattern)
```tsx
const llmFactory = context.orchestratorManager?.getLLMFactory();
const models = await llmFactory.getModels(provider, abortController.signal);
// Falls back to PROVIDER_MODELS[provider] if empty/error
```

### Reading current memory config
```tsx
const currentProvider = context.config.get<string>('memory.provider');
const currentModel = context.config.get<string>('memory.model');
```

### Writing memory config
```tsx
await context.config.set('memory.provider', provider, 'global');
await context.config.set('memory.model', model, 'global');
```

### Clearing memory config (reset to default)
```tsx
await context.config.delete('memory.provider', 'global');
await context.config.delete('memory.model', 'global');
```

### MemoryCommandComponent receives rawInput
```tsx
const MemoryCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const isConfig = context.rawInput.trim().split(/\s+/)[1]?.toLowerCase() === 'config';
  if (isConfig) return <MemoryConfigModal ... />;
  return <MemoryModal ... />;
};
```

---

## Task 1: Create `MemoryConfigModal` component

**Files:**
- Create: `packages/nuvin-cli/source/components/MemoryModal/MemoryConfigModal.tsx`

### Step 1: Create the component

The modal is structurally identical to `ModelsV2CommandComponent` in `models.tsx` with three differences:
1. Title is `"Memory Extraction Model"` instead of `"Select Model"`
2. On select: writes `memory.provider` + `memory.model` (not `activeProvider` + `model`)
3. Adds a `"[Use default (smallModel)]"` item at the top with `value: '__default__'` that clears both config keys

Current config values are pre-loaded and shown in the title (e.g. `"Memory Extraction Model  [openrouter / gpt-4.1-mini]"`).

```tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import { ComboBox, type ComboBoxItem } from '@/components/ComboBox/ComboBox.js';
import { HelpText } from '@/components/HelpText.js';
import { getAllProviders, getProviderLabel } from '@/config/providers.js';
import type { ProviderConfig } from '@/config/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import { PROVIDER_MODELS } from '@/const.js';
import type { CommandComponentProps } from '@/modules/commands/types.js';

type ProviderModelsCache = {
  models: string[];
  fetchedAt: number;
};

const MODEL_CACHE_TTL = 5 * 60 * 1000;
const modelsCache = new Map<string, ProviderModelsCache>();

function getCachedModels(provider: string): string[] | null {
  const cached = modelsCache.get(provider);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > MODEL_CACHE_TTL) {
    modelsCache.delete(provider);
    return null;
  }
  return cached.models;
}

function setCachedModels(provider: string, models: string[]): void {
  modelsCache.set(provider, { models, fetchedAt: Date.now() });
}

function getProvidersWithAuth(
  allProviders: string[],
  providersConfig: Record<string, ProviderConfig> | undefined,
): string[] {
  if (!providersConfig) return [];
  return allProviders.filter((provider) => {
    const config = providersConfig[provider.toLowerCase()] || providersConfig[provider];
    if (!config) return false;
    const auth = config.auth;
    if (!Array.isArray(auth) || auth.length === 0) return false;
    return auth.some((a) => {
      if (a.type === 'api-key' && a['api-key']) return true;
      if (a.type === 'oauth' && a.access) return true;
      return false;
    });
  });
}

interface MemoryConfigModalProps {
  context: CommandComponentProps['context'];
  deactivate: () => void;
  isActive: boolean;
}

export const MemoryConfigModal: React.FC<MemoryConfigModalProps> = ({
  context,
  deactivate,
  isActive,
}) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  const providersConfigRef = useRef(
    context.config.get<Record<string, ProviderConfig>>('providers'),
  );
  const providersConfig = providersConfigRef.current;

  const authenticatedProviders = useMemo(
    () => getProvidersWithAuth(getAllProviders(providersConfig), providersConfig),
    [providersConfig],
  );

  const currentProvider = context.config.get<string>('memory.provider');
  const currentModel = context.config.get<string>('memory.model');

  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({});
  const [loadingProviders, setLoadingProviders] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const llmFactory = context.orchestratorManager?.getLLMFactory();

  const fetchStartedRef = useRef(false);
  useEffect(() => {
    if (authenticatedProviders.length === 0 || fetchStartedRef.current) return;
    fetchStartedRef.current = true;

    const abortController = new AbortController();

    const fetchModelsForProvider = async (provider: string) => {
      const cached = getCachedModels(provider);
      if (cached) {
        setProviderModels((prev) => ({ ...prev, [provider]: cached }));
        return;
      }

      setLoadingProviders((prev) => ({ ...prev, [provider]: true }));
      try {
        const models = llmFactory
          ? await llmFactory.getModels(provider, abortController.signal)
          : [];
        const resolved = models.length > 0 ? models : (PROVIDER_MODELS[provider] ?? []);
        setCachedModels(provider, resolved);
        setProviderModels((prev) => ({ ...prev, [provider]: resolved }));
      } catch {
        setProviderModels((prev) => ({
          ...prev,
          [provider]: PROVIDER_MODELS[provider] ?? [],
        }));
      } finally {
        setLoadingProviders((prev) => ({ ...prev, [provider]: false }));
      }
    };

    for (const provider of authenticatedProviders) {
      fetchModelsForProvider(provider);
    }

    return () => {
      abortController.abort();
    };
  }, [authenticatedProviders, llmFactory]);

  const comboBoxItems = useMemo<ComboBoxItem[]>(() => {
    const items: ComboBoxItem[] = [];

    // Always show a reset option at the top
    items.push({
      label: 'Use default (provider smallModel)',
      value: '__default__',
      group: 'Reset',
    });

    for (const provider of authenticatedProviders) {
      const providerLabel = getProviderLabel(provider);
      const models = providerModels[provider] ?? [];
      const isLoading = loadingProviders[provider];

      if (isLoading && models.length === 0) {
        items.push({
          label: 'Loading...',
          value: `__loading__::${provider}`,
          group: providerLabel,
        });
      } else {
        for (const model of models) {
          items.push({
            label: model,
            value: `${provider}::${model}`,
            group: providerLabel,
          });
        }
      }
    }

    return items;
  }, [authenticatedProviders, providerModels, loadingProviders]);

  const handleSelect = async (item: ComboBoxItem) => {
    if (item.value.startsWith('__loading__::')) return;

    try {
      if (item.value === '__default__') {
        await context.config.delete('memory.provider', 'global');
        await context.config.delete('memory.model', 'global');
      } else {
        const [provider, model] = item.value.split('::');
        if (!provider || !model) return;
        await context.config.set('memory.provider', provider, 'global');
        await context.config.set('memory.model', model, 'global');
      }
      deactivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config');
    }
  };

  const modalHeight = Math.min(rows - 4, 24);

  const currentLabel =
    currentProvider && currentModel
      ? `${currentProvider} / ${currentModel}`
      : 'default (smallModel)';

  const titleRight = (
    <Text dimColor>{currentLabel}</Text>
  );

  if (authenticatedProviders.length === 0) {
    return (
      <AppModal
        visible={true}
        title="Memory Extraction Model"
        onClose={deactivate}
        closeOnEscape={true}
        height={8}
      >
        <Box flexDirection="column">
          <Text color={theme.colors.warning}>No providers configured.</Text>
          <Text color={theme.colors.muted} dimColor>
            Run /auth to configure a provider first.
          </Text>
        </Box>
      </AppModal>
    );
  }

  return (
    <AppModal
      visible={true}
      title="Memory Extraction Model"
      rightTitle={titleRight}
      onClose={deactivate}
      closeOnEscape={true}
      closeOnEnter={false}
      footer={
        <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
          <HelpText
            segments={[
              { text: '↑↓', highlight: true },
              { text: ' navigate • ' },
              { text: 'Enter', highlight: true },
              { text: ' select • ' },
              { text: 'ESC', highlight: true },
              { text: ' cancel' },
            ]}
          />
        </Box>
      }
      height={modalHeight}
    >
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {error && (
          <Box marginBottom={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        )}
        <ComboBox
          items={comboBoxItems}
          placeholder="Type to search models..."
          enableRotation={true}
          showItemCount={false}
          focus={isActive}
          onSelect={handleSelect}
          onCancel={deactivate}
        />
      </Box>
    </AppModal>
  );
};
```

**IMPORTANT:** Add `import type React from 'react';` at the top.

### Step 2: Check type correctness

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | grep -v "npm warn"`
Expected: no errors. Fix any that appear (likely `PROVIDER_MODELS` type — check `import { PROVIDER_MODELS } from '@/const.js'` and verify it's `Record<string, string[]>`).

### Step 3: Add export to index.ts

Add to `packages/nuvin-cli/source/components/MemoryModal/index.ts`:
```ts
export { MemoryConfigModal } from './MemoryConfigModal.js';
```

### Step 4: Run tsc again

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | grep -v "npm warn"`
Expected: clean.

---

## Task 2: Wire `config` arg in `memory.tsx`

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/memory.tsx`

### Step 1: Update MemoryCommandComponent to branch on `config` arg

Replace the component to detect `context.rawInput` arg and render `MemoryConfigModal` when it's `config`:

```tsx
import { MemoryConfigModal } from '@/components/MemoryModal/index.js';

const MemoryCommandComponent = ({ context, deactivate, isActive }: CommandComponentProps) => {
  const subcommand = context.rawInput.trim().split(/\s+/)[1]?.toLowerCase();

  if (subcommand === 'config') {
    return <MemoryConfigModal context={context} deactivate={deactivate} isActive={isActive} />;
  }

  // existing memory list logic below (loading, error, MemoryModal) ...
};
```

Keep all existing loading/error/MemoryModal logic intact — only add the early return for `subcommand === 'config'`.

### Step 2: Update the command registration description and keywords

```tsx
registry.register({
  id: '/memory',
  type: 'component',
  description: 'Manage long-term agent memories. /memory config to set extraction model.',
  category: 'session',
  keywords: ['memory', 'memories', 'remember', 'forget', 'config'],
  component: MemoryCommandComponent,
});
```

### Step 3: Run tsc

Run: `cd packages/nuvin-cli && npx tsc --noEmit 2>&1 | grep -v "npm warn"`
Expected: clean.

### Step 4: Run tests

Run: `cd packages/nuvin-cli && pnpm test 2>&1 | tail -10`
Expected: all tests pass.

### Step 5: Commit

```bash
git add packages/nuvin-cli/source/components/MemoryModal/MemoryConfigModal.tsx \
        packages/nuvin-cli/source/components/MemoryModal/index.ts \
        packages/nuvin-cli/source/modules/commands/definitions/memory.tsx
git commit -m "feat(memory): add /memory config command for extraction model selection"
```

---

## Summary of changes

### New files (1):
- `packages/nuvin-cli/source/components/MemoryModal/MemoryConfigModal.tsx`

### Modified files (2):
- `packages/nuvin-cli/source/components/MemoryModal/index.ts` — add `MemoryConfigModal` export
- `packages/nuvin-cli/source/modules/commands/definitions/memory.tsx` — branch on `config` subcommand

### No changes needed:
- `packages/nuvin-cli/source/config/types.ts` — `MemorySettings.provider` and `MemorySettings.model` already added
- `packages/nuvin-cli/source/services/OrchestratorManager.ts` — extraction already reads `memory.provider`/`memory.model`
