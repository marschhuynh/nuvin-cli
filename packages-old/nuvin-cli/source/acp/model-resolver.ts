/**
 * Model resolution and display name building for ACP sessions.
 * Extracted from AcpServer to isolate model enumeration logic.
 */

import { getProviderDefaultModels } from "@nuvin/nuvin-core";
import { PROVIDER_MODELS } from "../const.js";
import type { ConfigManager } from "../config/manager.js";
import type { ProviderKey } from "../config/providers.js";
import type { IOrchestratorManager } from "../services/IOrchestratorManager.js";

export type ModelsState = {
  availableModels: Array<{
    modelId: string;
    name: string;
    description?: string;
  }>;
  currentModelId: string;
};

export type SelectOptions = {
  currentValue: string;
  options: Array<{ value: string; name: string }>;
};

export class AcpModelResolver {
  constructor(
    private orchestratorManager: IOrchestratorManager,
    private configManager: ConfigManager
  ) {}

  async buildModelsState(precomputedModels?: string[]): Promise<ModelsState> {
    const config = this.configManager.getConfig();
    const configuredModel = this.normalizeConfiguredModel(
      String(config.model ?? "").trim()
    );
    const providers = this.orchestratorManager.getAvailableProviders();
    const availableModels =
      precomputedModels ??
      (await this.getAllModelIdsAcrossProviders(providers));
    const selectState = this.toSelectOptions(
      availableModels,
      configuredModel,
      "Current Model"
    );
    const displayNames = this.buildModelDisplayNames(
      selectState.options.map((option) => option.value)
    );
    const providersByModel = await this.buildModelProviderIndex(providers);

    return {
      currentModelId: configuredModel || selectState.currentValue,
      availableModels: selectState.options.map((option) => {
        const modelProviders = providersByModel.get(option.value) ?? [];
        const providerSuffix =
          modelProviders.length > 0 ? ` (${modelProviders.join(", ")})` : "";

        return {
          modelId: option.value,
          name:
            displayNames.get(option.value) ??
            this.humanizeModelName(option.value),
          description: `${
            option.value === configuredModel
              ? "Current model"
              : "Available model"
          }${providerSuffix}`,
        };
      }),
    };
  }

  buildModelDisplayNames(modelIds: string[]): Map<string, string> {
    const byId = modelIds.map((modelId) => ({
      modelId,
      baseName: this.humanizeModelName(modelId),
    }));
    const counts = new Map<string, number>();

    for (const entry of byId) {
      counts.set(entry.baseName, (counts.get(entry.baseName) ?? 0) + 1);
    }

    const result = new Map<string, string>();
    for (const entry of byId) {
      const isAmbiguous = (counts.get(entry.baseName) ?? 0) > 1;
      result.set(
        entry.modelId,
        isAmbiguous ? `${entry.baseName} (${entry.modelId})` : entry.baseName
      );
    }

    return result;
  }

  async buildModelProviderIndex(
    providers: string[]
  ): Promise<Map<string, string[]>> {
    const uniqueProviders = Array.from(
      new Set(
        providers.filter((provider) => provider && provider.trim().length > 0)
      )
    );
    const index = new Map<string, string[]>();

    for (const provider of uniqueProviders) {
      const modelIds = await this.getAllModelIdsForProvider(provider);
      for (const modelId of modelIds) {
        const existing = index.get(modelId) ?? [];
        if (!existing.includes(provider)) {
          existing.push(provider);
        }
        index.set(modelId, existing);
      }
    }

    return index;
  }

  async getAllModelIdsForProvider(provider: string): Promise<string[]> {
    const providerModels = await this.getProviderModels(provider);
    const configuredModels = this.getConfiguredModelIds(provider);
    const defaults = getProviderDefaultModels(provider);
    const combined = [
      ...providerModels,
      ...configuredModels,
      ...defaults,
    ].filter((modelId) => modelId && modelId.trim().length > 0);
    return Array.from(new Set(combined));
  }

  async getAllModelIdsAcrossProviders(providers: string[]): Promise<string[]> {
    const uniqueProviders = Array.from(
      new Set(
        providers.filter((provider) => provider && provider.trim().length > 0)
      )
    );
    const providersToResolve =
      uniqueProviders.length > 0
        ? uniqueProviders
        : [
            String(
              this.configManager.getConfig().activeProvider ?? "openrouter"
            ),
          ];
    const allModels = await Promise.all(
      providersToResolve.map((provider) =>
        this.getAllModelIdsForProvider(provider)
      )
    );
    return Array.from(
      new Set(
        allModels
          .flat()
          .filter((modelId) => modelId && modelId.trim().length > 0)
      )
    );
  }

  async findProviderForModel(modelId: string): Promise<string | null> {
    if (!modelId) {
      return null;
    }

    const providers = this.orchestratorManager.getAvailableProviders();
    for (const provider of providers) {
      const models = await this.getAllModelIdsForProvider(provider);
      if (models.includes(modelId)) {
        return provider;
      }
    }

    return null;
  }

  normalizeConfiguredModel(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (this.isModelEndpointPath(trimmed)) {
      return "";
    }
    return trimmed;
  }

  isModelEndpointPath(value: string): boolean {
    return value.startsWith("/") || /^https?:\/\//i.test(value);
  }

  toSelectOptions(
    values: string[],
    currentValue: string,
    fallbackName: string
  ): SelectOptions {
    const deduped = Array.from(
      new Set(values.filter((value) => value && value.trim().length > 0))
    );

    if (currentValue && !deduped.includes(currentValue)) {
      deduped.unshift(currentValue);
    }

    if (deduped.length === 0) {
      const fallbackValue = currentValue || "current";
      return {
        currentValue: fallbackValue,
        options: [{ value: fallbackValue, name: currentValue || fallbackName }],
      };
    }

    return {
      currentValue: currentValue || deduped[0] || "current",
      options: deduped.map((value) => ({ value, name: value })),
    };
  }

  humanizeModelName(modelId: string): string {
    const lower = modelId.toLowerCase();
    if (lower === "default") return "Default (recommended)";

    // Anthropic
    if (lower.includes("opus")) return "Opus";
    if (lower.includes("haiku")) return "Haiku";
    if (lower.includes("sonnet")) return "Sonnet";

    // OpenAI — match gpt-4o, gpt-4.1, o3-mini, etc.
    const gptMatch = modelId.match(/\b((?:gpt|o\d)[-\w.]*)/i);
    if (gptMatch) return gptMatch[1].toUpperCase();

    // Google — match gemini-2.5-pro, gemini-flash, etc.
    const geminiMatch = modelId.match(/\bgemini[-\s]?(\S*)/i);
    if (geminiMatch) {
      const suffix = geminiMatch[1]
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      return suffix ? `Gemini ${suffix}` : "Gemini";
    }

    // Meta — match llama-3.3-70b, etc.
    const llamaMatch = modelId.match(/\bllama[-\s]?(\S*)/i);
    if (llamaMatch) {
      const suffix = llamaMatch[1].replace(/[-_]+/g, " ").trim().toUpperCase();
      return suffix ? `Llama ${suffix}` : "Llama";
    }

    // Mistral — match mistral-large, mistral-small, codestral, etc.
    const mistralMatch = modelId.match(/\b(mistral[-\w]*|codestral[-\w]*)/i);
    if (mistralMatch) {
      return mistralMatch[1]
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    // DeepSeek
    const deepseekMatch = modelId.match(/\bdeepseek[-\s]?(\S*)/i);
    if (deepseekMatch) {
      const suffix = deepseekMatch[1]
        .replace(/[-_]+/g, " ")
        .trim()
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      return suffix ? `DeepSeek ${suffix}` : "DeepSeek";
    }

    return modelId;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async getProviderModels(provider: string): Promise<string[]> {
    const fetchedModels = await this.orchestratorManager.getAvailableModels(
      provider as ProviderKey
    );
    if (fetchedModels.length > 0) {
      return fetchedModels;
    }
    return this.getFallbackModels(provider);
  }

  private getFallbackModels(provider: string): string[] {
    const fallback = PROVIDER_MODELS[provider as ProviderKey];
    return Array.isArray(fallback) ? fallback : [];
  }

  private getConfiguredModelIds(provider: string): string[] {
    const config = this.configManager.getConfig();
    const providerConfig = config.providers?.[provider];
    if (!providerConfig) {
      return [];
    }

    const baseModels = [providerConfig.model, providerConfig.defaultModel]
      .map((value) =>
        typeof value === "string" ? this.normalizeConfiguredModel(value) : ""
      )
      .filter((value) => value.length > 0);

    const modelsConfig = providerConfig.models;
    if (
      modelsConfig === undefined ||
      modelsConfig === null ||
      typeof modelsConfig === "boolean"
    ) {
      return baseModels;
    }

    if (typeof modelsConfig === "string") {
      const configured = this.normalizeConfiguredModel(modelsConfig);
      return configured ? [...baseModels, configured] : baseModels;
    }

    if (Array.isArray(modelsConfig)) {
      const listModels = modelsConfig
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (entry && typeof entry === "object" && "id" in entry) {
            return String((entry as { id: unknown }).id);
          }
          return "";
        })
        .map((id) => this.normalizeConfiguredModel(id))
        .filter((id) => id.length > 0);
      return [...baseModels, ...listModels];
    }

    return baseModels;
  }
}
