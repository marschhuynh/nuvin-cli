export type { ResolveAgentDirectoriesOptions } from "./agent-loader.js";
export {
  discoverAgentDefinitionsFromDirectories,
  loadAgentDefinitionFromReference,
  loadAgentDefinitionsFromDirectories,
  resolveAgentDirectories,
} from "./agent-loader.js";
export { ConfigConflictError } from "./conflicts.js";
export {
  CONFIG_DIR_NAME,
  CONFIG_FILE_CANDIDATES,
  DEFAULT_CONFIG_DIR_NAME,
  DEFAULT_CONFIG_FILE,
  normalizeConfigDirName,
  SCOPE_PRIORITY,
} from "./constants.js";
export { loadEnvConfig, resolveConfigDirName } from "./env.js";
export type { FileLockOptions } from "./file-lock.js";
export { withFileLock } from "./file-lock.js";
export type { ConfigManagerOptions } from "./manager.js";
export { ConfigManager } from "./manager.js";
export type { ProfileManagerOptions } from "./profile-manager.js";
export { ProfileManager } from "./profile-manager.js";
export type {
  CreateProfileOptions,
  DeleteProfileOptions,
  ProfileMetadata,
  ProfilesRegistry,
} from "./profile-types.js";
export {
  DEFAULT_PROFILE,
  PROFILE_NAME_PATTERN,
  PROFILES_DIR,
  PROFILES_REGISTRY_FILE,
} from "./profile-types.js";
export type { SafeParseResult } from "./schema.js";
export { cliConfigSchema, parseCliConfig, safeParseCliConfig } from "./schema.js";
export type { ConfigChangeEvent, ConfigChangeListener } from "./types.js";
export * from "./types.js";
export {
  createNestedPatch,
  deepMerge,
  deleteNestedValue,
  getNestedValue,
  getProviderAuth,
  isPlainObject,
  mergeConfigs,
  pickActiveAuth,
  resolveProviderToken,
  structuredCloneConfig,
} from "./utils.js";
