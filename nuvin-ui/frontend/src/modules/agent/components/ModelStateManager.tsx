import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useModelsStore } from "@/store/useModelsStore";
import { useProviderStore } from "@/store/useProviderStore";
import {
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  Type,
  Image,
  Mic,
  FileText,
  Filter,
} from "lucide-react";
import {
  fetchProviderModels,
  type ProviderType,
} from "@/lib/providers/provider-utils";
import { useActiveModel, useActiveModelActions } from "../hooks/useActiveModel";
import { ModelsList } from "./ModelsList";

export function ModelStateManager() {
  const { availableModels, isLoading, error } = useActiveModel();
  const { setProviderModels, setProviderLoading, setProviderError } =
    useActiveModelActions();
  const { enableAllModels, disableAllModels } = useModelsStore();
  const { activeProviderId, providers } = useProviderStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [modalityFilter, setModalityFilter] = useState<string | null>(null);

  // Get the active provider configuration
  const activeProvider = providers.find((p) => p.id === activeProviderId);

  // Filter models based on search query and modality filter
  const filteredModels = useMemo(() => {
    let models = availableModels;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (model) =>
          model.id.toLowerCase().includes(query) ||
          model.modality?.toLowerCase().includes(query) ||
          model.name.toLowerCase().includes(query)
      );
    }

    // Apply modality filter
    if (modalityFilter) {
      models = models.filter((model) => {
        const inputModalities = model.inputModalities || [];
        const outputModalities = model.outputModalities || [];
        const allModalities = [...inputModalities, ...outputModalities];
        return allModalities.includes(modalityFilter);
      });
    }

    return models;
  }, [availableModels, searchQuery, modalityFilter]);

  const handleReloadModels = async () => {
    if (!activeProvider || !activeProviderId || isLoading) {
      return;
    }

    setProviderError(null);
    setProviderLoading(true);

    try {
      const fetchedModels = await fetchProviderModels({
        type: activeProvider.type as ProviderType,
        apiKey: activeProvider.apiKey,
        name: activeProvider.name,
      });
      console.log("Fetched models:", fetchedModels);
      setProviderModels(fetchedModels);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reload models";
      setProviderError(errorMessage);
    }
  };

  if (!activeProviderId || (!availableModels.length && !isLoading && !error)) {
    return (
      <div className="p-3 border rounded-lg bg-card">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">Model Management</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadModels}
            disabled={isLoading || !activeProvider?.apiKey}
            className="h-6 w-6 p-0 flex-shrink-0"
            title="Reload models"
          >
            <RefreshCw
              className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          No models available for the current provider.
        </p>
      </div>
    );
  }

  const enabledCount = availableModels.filter((model) => model.enabled).length;
  const totalCount = availableModels.length;
  const filteredEnabledCount = filteredModels.filter(
    (model) => model.enabled
  ).length;
  const filteredTotalCount = filteredModels.length;

  const handleEnableAll = () => {
    enableAllModels(activeProviderId);
  };

  const handleDisableAll = () => {
    disableAllModels(activeProviderId);
  };

  return (
    <div className="flex flex-col border rounded-lg bg-card overflow-hidden h-full">
      <div className="flex items-center justify-between p-3 border-b flex-shrink-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">Model Management</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReloadModels}
            disabled={isLoading || !activeProvider?.apiKey}
            className="h-6 w-6 p-0 flex-shrink-0"
            title="Reload models"
          >
            <RefreshCw
              className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-1 ml-2">
          {searchQuery || modalityFilter
            ? `${filteredEnabledCount}/${filteredTotalCount}`
            : `${enabledCount}/${totalCount}`}
        </span>
      </div>

      <div className="flex flex-col p-3 flex-1 min-h-0">
        {/* Error Display */}
        {error && (
          <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {/* Search Input */}
        <div className="mb-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 h-7 text-xs"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Filter and Bulk Actions */}
        <div className="flex items-center justify-between gap-4 mb-3 flex-shrink-0">
          {/* Modality Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-3 h-3 text-muted-foreground" />
            <div className="flex gap-1">
              <Button
                variant={modalityFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setModalityFilter(null)}
                className="h-6 text-[10px] px-2"
              >
                All
              </Button>
              <Button
                variant={modalityFilter === "text" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setModalityFilter(modalityFilter === "text" ? null : "text")
                }
                className="h-6 text-[10px] px-2"
              >
                <Type className="w-3 h-3 mr-1" />
                Text
              </Button>
              <Button
                variant={modalityFilter === "image" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setModalityFilter(modalityFilter === "image" ? null : "image")
                }
                className="h-6 text-[10px] px-2"
              >
                <Image className="w-3 h-3 mr-1" />
                Image
              </Button>
              <Button
                variant={modalityFilter === "audio" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setModalityFilter(modalityFilter === "audio" ? null : "audio")
                }
                className="h-6 text-[10px] px-2"
              >
                <Mic className="w-3 h-3 mr-1" />
                Audio
              </Button>
              <Button
                variant={modalityFilter === "file" ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  setModalityFilter(modalityFilter === "file" ? null : "file")
                }
                className="h-6 text-[10px] px-2"
              >
                <FileText className="w-3 h-3 mr-1" />
                File
              </Button>
            </div>
          </div>

          {/* Bulk Actions */}
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableAll}
              disabled={enabledCount === totalCount || isLoading}
              className="h-6 text-[10px] px-2"
            >
              <Eye className="w-3 h-3 mr-1" />
              Enable All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisableAll}
              disabled={enabledCount === 0 || isLoading}
              className="h-6 text-[10px] px-2"
            >
              <EyeOff className="w-3 h-3 mr-1" />
              Disable All
            </Button>
          </div>
        </div>

        {/* Individual Model Controls */}
        <ModelsList
          models={filteredModels}
          isLoading={isLoading}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
