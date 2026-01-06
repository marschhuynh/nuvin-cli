import { ErrorReason } from '@nuvin/nuvin-core';
import type { Theme } from '@/theme.js';
import type { StatusMessage } from './types.js';

type ErrorConfig = {
  text: string;
  colorKey: 'warning' | 'error';
};

const errorStatusMap: Record<ErrorReason, ErrorConfig> = {
  [ErrorReason.Aborted]: { text: 'Aborted', colorKey: 'warning' },
  [ErrorReason.Denied]: { text: 'Denied', colorKey: 'warning' },
  [ErrorReason.Edited]: { text: 'Edited', colorKey: 'warning' },
  [ErrorReason.Timeout]: { text: 'Timeout', colorKey: 'warning' },
  [ErrorReason.PermissionDenied]: { text: 'Permission denied', colorKey: 'error' },
  [ErrorReason.NotFound]: { text: 'Not found', colorKey: 'error' },
  [ErrorReason.ToolNotFound]: { text: 'Tool not found', colorKey: 'error' },
  [ErrorReason.NetworkError]: { text: 'Network error', colorKey: 'error' },
  [ErrorReason.RateLimit]: { text: 'Rate limit', colorKey: 'warning' },
  [ErrorReason.InvalidInput]: { text: 'Invalid input', colorKey: 'error' },
  [ErrorReason.Unknown]: { text: 'Unknown error', colorKey: 'error' },
  [ErrorReason.ValidationFailed]: {
    text: '',
    colorKey: 'warning'
  }
};

export function getErrorStatus(
  errorReason: ErrorReason | undefined,
  theme: Theme,
  paramText: string,
): StatusMessage | null {
  if (!errorReason) return null;

  const config = errorStatusMap[errorReason];
  if (!config) return null;

  const fallbackColor = config.colorKey === 'warning' ? 'yellow' : 'red';
  const color = theme.colors[config.colorKey] || fallbackColor;

  return {
    text: config.text,
    color,
    paramText,
  };
}
