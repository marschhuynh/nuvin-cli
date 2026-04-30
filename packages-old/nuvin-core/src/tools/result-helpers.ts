import type { ExecResultError } from './types.js';
import type { ErrorReason } from '../ports.js';

export function okText<M extends Record<string, unknown> = Record<string, unknown>>(
  result: string, 
  metadata: M
): { status: 'success'; type: 'text'; result: string; metadata: M } {
  return { status: 'success', type: 'text', result, metadata };
}

export function okJson<
  T extends Record<string, unknown> | unknown[],
  M extends Record<string, unknown> = Record<string, unknown>
>(
  result: T,
  metadata?: M
): { status: 'success'; type: 'json'; result: T; metadata?: M } {
  return { status: 'success', type: 'json', result, metadata };
}

export function err(
  result: string,
  metadata?: Record<string, unknown>,
  errorReason?: ErrorReason
): ExecResultError {
  const finalMetadata = errorReason ? { ...metadata, errorReason } : metadata;
  return { status: 'error', type: 'text', result, metadata: finalMetadata };
}
