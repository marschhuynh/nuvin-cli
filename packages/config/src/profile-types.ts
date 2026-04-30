export const DEFAULT_PROFILE = "default";
export const PROFILES_REGISTRY_FILE = "profiles.yaml";
export const PROFILES_DIR = "profiles";
export const PROFILE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface ProfileMetadata {
  name: string;
  createdAt?: number;
  updatedAt?: number;
  description?: string;
}

export interface ProfilesRegistry {
  active: string;
  profiles: Record<string, ProfileMetadata>;
}

export interface CreateProfileOptions {
  description?: string;
  copyFrom?: string;
}

export interface DeleteProfileOptions {
  force?: boolean;
}
