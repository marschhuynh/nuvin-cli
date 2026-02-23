import { describe, it, expect } from 'vitest';
import {
  resolveThemeRuntime,
  detectTerminalColorLevel,
  type ThemeMode,
  type ThemeColorLevel,
} from '../source/theme.js';

describe('detectTerminalColorLevel', () => {
  it('returns none when NO_COLOR is set', () => {
    const colorLevel = detectTerminalColorLevel(undefined, {
      NO_COLOR: '1',
    } as NodeJS.ProcessEnv);

    expect(colorLevel).toBe<ThemeColorLevel>('none');
  });

  it('uses FORCE_COLOR=2 as ansi256', () => {
    const colorLevel = detectTerminalColorLevel(undefined, {
      FORCE_COLOR: '2',
    } as NodeJS.ProcessEnv);

    expect(colorLevel).toBe<ThemeColorLevel>('ansi256');
  });
});

describe('resolveThemeRuntime', () => {
  it('detects light mode from COLORFGBG and disables backgrounds in auto mode', () => {
    const runtime = resolveThemeRuntime({
      env: {
        COLORFGBG: '0;15',
      } as NodeJS.ProcessEnv,
    });

    expect(runtime.mode).toBe<ThemeMode>('light');
    expect(runtime.useBackgrounds).toBe(false);
    expect(runtime.theme.colors.background).toBe('transparent');
  });

  it('enables backgrounds when explicitly set to on', () => {
    const runtime = resolveThemeRuntime({
      mode: 'dark',
      backgrounds: 'on',
      colorLevel: 'truecolor',
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.useBackgrounds).toBe(true);
    expect(runtime.theme.colors.background).not.toBe('transparent');
  });
});
