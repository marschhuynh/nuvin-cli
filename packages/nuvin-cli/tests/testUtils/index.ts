/**
 * Test utilities index
 * 
 * Centralizes exports for all test utilities to make imports cleaner.
 */

export {
  // Mock objects
  mockTheme,
  mockAltMode,
  mockToolApproval,
  mockStdoutDimensions,
  mockUseFocus,
  mockUseInput,
  mockUseMouse,
  
  // Mock factories
  createThemeMock,
  createAltModeMock,
  createToolApprovalMock,
  createStdoutDimensionsMock,
  createUseFocusMock,
  
  // Setup functions
  setupContextMocks,
  setupContextMocksWithOverrides,
} from './contextMocks.js';
