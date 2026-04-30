import type { ExecResult, ExecResultSuccess, ExecResultError } from './types.js';

export function isSuccess(result: ExecResult): result is ExecResultSuccess {
  return result.status === 'success';
}

export function isError(result: ExecResult): result is ExecResultError {
  return result.status === 'error';
}

export function isTextResult(result: ExecResult): result is Extract<ExecResult, { type: 'text' }> {
  return result.type === 'text';
}

export function isJsonResult(result: ExecResult): result is Extract<ExecResult, { type: 'json' }> {
  return result.type === 'json';
}

export function isSuccessText(result: ExecResult): result is Extract<ExecResultSuccess, { type: 'text' }> {
  return result.status === 'success' && result.type === 'text';
}

export function isSuccessJson(result: ExecResult): result is Extract<ExecResultSuccess, { type: 'json' }> {
  return result.status === 'success' && result.type === 'json';
}
