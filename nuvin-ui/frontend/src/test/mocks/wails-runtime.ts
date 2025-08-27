import { vi } from 'vitest';

export const LogError = vi.fn();
export const LogInfo = vi.fn();
export const EventsOn = vi.fn();
export const EventsOff = vi.fn();
export const isWailsEnvironment = false;

export const Browser = {
  OpenFile: vi.fn(),
  OpenURL: vi.fn(),
  OpenDialog: vi.fn(),
  SaveDialog: vi.fn(),
};

export const Window = {
  SetTitle: vi.fn(),
  SetSize: vi.fn(),
  SetPosition: vi.fn(),
  Center: vi.fn(),
  Fullscreen: vi.fn(),
  UnFullscreen: vi.fn(),
  IsFullscreen: vi.fn(() => false),
  Minimise: vi.fn(),
  UnMinimise: vi.fn(),
  IsMinimised: vi.fn(() => false),
  Maximise: vi.fn(),
  UnMaximise: vi.fn(),
  IsMaximised: vi.fn(() => false),
  Show: vi.fn(),
  Hide: vi.fn(),
  IsVisible: vi.fn(() => true),
  Close: vi.fn(),
};

export const Dialog = {
  Info: vi.fn(),
  Warning: vi.fn(),
  Error: vi.fn(),
  Question: vi.fn(),
};

export const Clipboard = {
  SetText: vi.fn(),
  Text: vi.fn(() => Promise.resolve('')),
};
