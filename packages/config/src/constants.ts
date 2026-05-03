export const DEFAULT_CONFIG_DIR_NAME = ".nuvin";
export const CONFIG_DIR_NAME = DEFAULT_CONFIG_DIR_NAME;
export const CONFIG_FILE_CANDIDATES = ["config.yaml", "config.yml", "config.json"] as const;
export const DEFAULT_CONFIG_FILE = "config.yaml";
export const SCOPE_PRIORITY = ["global", "local", "explicit", "env", "direct"] as const;

export function normalizeConfigDirName(name: string | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return DEFAULT_CONFIG_DIR_NAME;
  }

  if (trimmed === "." || trimmed === ".." || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Invalid config directory name: ${name}`);
  }

  return trimmed;
}
