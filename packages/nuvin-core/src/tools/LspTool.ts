import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { err } from './result-helpers.js';

export type LspOperation =
  | 'goToDefinition'
  | 'findReferences'
  | 'hover'
  | 'documentSymbol'
  | 'workspaceSymbol'
  | 'goToImplementation'
  | 'prepareCallHierarchy'
  | 'incomingCalls'
  | 'outgoingCalls'
  | 'diagnostics';

export type LspParams = {
  operation: LspOperation;
  filePath: string;
  line: number;
  character: number;
  query?: string;
};

export type LspSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata?: {
    operation: LspOperation;
    filePath: string;
    line: number;
    character: number;
    resultCount?: number;
  };
};

export type LspResult = LspSuccessResult | ExecResultError;

export interface LspService {
  init(): Promise<void>;
  isEnabled(): boolean;
  hasClients(file: string): Promise<boolean>;
  touchFile(filePath: string, waitDiagnostics?: boolean): Promise<void>;
  diagnostics(): Promise<Record<string, unknown[]>>;
  diagnosticsForFile(filePath: string): Promise<unknown[]>;
  definition(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
  references(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
  hover(pos: { file: string; line: number; character: number }): Promise<unknown | null>;
  documentSymbol(uri: string): Promise<unknown[]>;
  workspaceSymbol(query: string): Promise<unknown[]>;
  implementation(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
  prepareCallHierarchy(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
  incomingCalls(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
  outgoingCalls(pos: { file: string; line: number; character: number }): Promise<unknown[]>;
}

type LspToolOptions = {
  rootDir?: string;
  lspService?: LspService;
};

const VALID_OPERATIONS: LspOperation[] = [
  'goToDefinition',
  'findReferences',
  'hover',
  'documentSymbol',
  'workspaceSymbol',
  'goToImplementation',
  'prepareCallHierarchy',
  'incomingCalls',
  'outgoingCalls',
  'diagnostics',
];

export class LspTool implements FunctionTool<LspParams, ToolExecutionContext, LspResult> {
  name = 'lsp' as const;

  private readonly rootDir: string;
  private lspService?: LspService;

  constructor(opts: LspToolOptions = {}) {
    this.rootDir = path.resolve(opts.rootDir ?? process.cwd());
    this.lspService = opts.lspService;
  }

  setLspService(service: LspService): void {
    this.lspService = service;
  }

  parameters = {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: VALID_OPERATIONS,
        description: 'The LSP operation to perform',
      },
      filePath: {
        type: 'string',
        description: 'The absolute or relative path to the file',
      },
      line: {
        type: 'number',
        description: 'The line number (1-based, as shown in editors)',
      },
      character: {
        type: 'number',
        description: 'The character offset (1-based, as shown in editors)',
      },
      query: {
        type: 'string',
        description: 'Search query for workspaceSymbol operation (optional)',
      },
    },
    required: ['operation', 'filePath', 'line', 'character'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: [
        'Query code intelligence from language servers to understand code structure and relationships.',
        'Use this to find definitions, references, type info, and errors - the same features available in VS Code.',
        'Supports TypeScript, JavaScript, and React files (.ts, .tsx, .js, .jsx).',
        '',
        '## When to Use This Tool',
        '',
        'Use LSP tool when you need to:',
        '1. **Understand unfamiliar code** - Use hover/goToDefinition to learn what a function does',
        '2. **Find where something is defined** - Jump to source of imported functions, types, or variables',
        '3. **Find all usages before refactoring** - Use findReferences before renaming or modifying',
        '4. **Understand call relationships** - Use incomingCalls/outgoingCalls to trace execution flow',
        '5. **Get file structure overview** - Use documentSymbol to see all functions/classes in a file',
        '6. **Search codebase by symbol name** - Use workspaceSymbol when you know function/class name',
        '7. **Check for errors after edits** - Use diagnostics to verify your changes compile correctly',
        '',
        '## Supported Operations',
        '',
        '- goToDefinition: Find where a symbol is defined',
        '- findReferences: Find all references to a symbol',
        '- hover: Get hover information (documentation, type info) for a symbol',
        '- documentSymbol: Get all symbols (functions, classes, variables) in a document',
        '- workspaceSymbol: Search for symbols across the entire workspace (requires query param)',
        '- goToImplementation: Find implementations of an interface or abstract method',
        '- incomingCalls: Find all functions/methods that call the function at a position',
        '- outgoingCalls: Find all functions/methods called by the function at a position',
        '- diagnostics: Get all diagnostics (errors, warnings) for a file',
        '',
        '## Examples',
        '',
        '**Example 1: Understanding what a function does**',
        'When you see `processData(items)` at line 45, char 5:',
        '  lsp({ operation: "hover", filePath: "src/handler.ts", line: 45, character: 5 })',
        '  → Returns type signature and JSDoc documentation',
        '',
        '**Example 2: Finding where a function is defined**',
        'To find the source of `validateInput` imported at line 3:',
        '  lsp({ operation: "goToDefinition", filePath: "src/api.ts", line: 3, character: 10 })',
        '  → Returns the file and line where validateInput is implemented',
        '',
        '**Example 3: Finding all usages before refactoring**',
        'Before renaming `getUserById` function at line 20:',
        '  lsp({ operation: "findReferences", filePath: "src/users.ts", line: 20, character: 15 })',
        '  → Returns all files and locations that call this function',
        '',
        '**Example 4: Understanding call flow**',
        'To see what calls `handleRequest` at line 50:',
        '  lsp({ operation: "incomingCalls", filePath: "src/server.ts", line: 50, character: 10 })',
        '  → Returns all callers of this function',
        '',
        '**Example 5: Getting file overview**',
        'To see all functions and classes in a file:',
        '  lsp({ operation: "documentSymbol", filePath: "src/utils.ts", line: 1, character: 1 })',
        '  → Returns list of all symbols with their types and locations',
        '',
        '**Example 6: Searching for a function by name**',
        'To find where `createUser` is defined in the codebase:',
        '  lsp({ operation: "workspaceSymbol", filePath: "src/any.ts", line: 1, character: 1, query: "createUser" })',
        '  → Returns all symbols matching "createUser" across workspace',
        '',
        '**Example 7: Checking for errors after editing**',
        'After making changes to a file:',
        '  lsp({ operation: "diagnostics", filePath: "src/modified.ts", line: 1, character: 1 })',
        '  → Returns any TypeScript errors, warnings, or hints',
        '',
        '## Parameters',
        '',
        '- filePath: The file to operate on (absolute or relative to project root)',
        '- line: The line number (1-based, as shown in editors)',
        '- character: The character offset (1-based, as shown in editors)',
        '- query: Search query for workspaceSymbol operation (optional)',
        '',
        'Note: LSP servers must be available for the file type (TypeScript, JavaScript, Python, etc.).',
      ].join('\n'),
      parameters: this.parameters,
    };
  }

  async execute(params: LspParams, context?: ToolExecutionContext): Promise<LspResult> {
    const { operation, filePath, line, character, query } = params;

    if (!this.lspService) {
      return err('LSP service not initialized. LSP features are not available.', {
        errorReason: ErrorReason.NotFound,
      });
    }

    if (!this.lspService.isEnabled()) {
      return err('LSP is disabled. Set NUVIN_DISABLE_LSP=false to enable.', {
        errorReason: ErrorReason.Denied,
      });
    }

    if (!VALID_OPERATIONS.includes(operation)) {
      return err(`Invalid operation: ${operation}. Valid operations: ${VALID_OPERATIONS.join(', ')}`, {
        errorReason: ErrorReason.InvalidInput,
      });
    }

    if (typeof line !== 'number' || line < 1) {
      return err('Line must be a positive integer (1-based)', {
        errorReason: ErrorReason.InvalidInput,
      });
    }

    if (typeof character !== 'number' || character < 1) {
      return err('Character must be a positive integer (1-based)', {
        errorReason: ErrorReason.InvalidInput,
      });
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context?.workspaceDir || this.rootDir, filePath);

    if (!fs.existsSync(absolutePath)) {
      return err(`File not found: ${absolutePath}`, {
        errorReason: ErrorReason.NotFound,
      });
    }

    const hasClients = await this.lspService.hasClients(absolutePath);
    if (!hasClients) {
      const ext = path.extname(absolutePath);
      return err(`No LSP server available for file type: ${ext}`, {
        errorReason: ErrorReason.NotFound,
      });
    }

    await this.lspService.touchFile(absolutePath, true);

    const position = {
      file: absolutePath,
      line: line - 1,
      character: character - 1,
    };

    try {
      let result: unknown;
      let resultCount = 0;

      switch (operation) {
        case 'goToDefinition':
          result = await this.lspService.definition(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'findReferences':
          result = await this.lspService.references(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'hover':
          result = await this.lspService.hover(position);
          resultCount = result ? 1 : 0;
          break;

        case 'documentSymbol':
          result = await this.lspService.documentSymbol(absolutePath);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'workspaceSymbol':
          result = await this.lspService.workspaceSymbol(query || '');
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'goToImplementation':
          result = await this.lspService.implementation(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'prepareCallHierarchy':
          result = await this.lspService.prepareCallHierarchy(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'incomingCalls':
          result = await this.lspService.incomingCalls(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'outgoingCalls':
          result = await this.lspService.outgoingCalls(position);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;

        case 'diagnostics':
          result = await this.lspService.diagnosticsForFile(absolutePath);
          resultCount = Array.isArray(result) ? result.length : 0;
          break;
      }

      const output = this.formatResult(operation, result);

      return {
        status: 'success',
        type: 'text',
        result: output,
        metadata: {
          operation,
          filePath: absolutePath,
          line,
          character,
          resultCount,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(`LSP operation failed: ${message}`, {
        errorReason: ErrorReason.Unknown,
      });
    }
  }

  private formatResult(operation: LspOperation, result: unknown): string {
    if (result === null || result === undefined) {
      return `No result for ${operation}`;
    }

    if (Array.isArray(result) && result.length === 0) {
      return `No results found for ${operation}`;
    }

    if (operation === 'hover' && result && typeof result === 'object') {
      return this.formatHover(result);
    }

    if (operation === 'diagnostics' && Array.isArray(result)) {
      return this.formatDiagnostics(result);
    }

    if ((operation === 'goToDefinition' || operation === 'findReferences' || operation === 'goToImplementation') && Array.isArray(result)) {
      return this.formatLocations(result);
    }

    if ((operation === 'documentSymbol' || operation === 'workspaceSymbol') && Array.isArray(result)) {
      return this.formatSymbols(result);
    }

    return JSON.stringify(result, null, 2);
  }

  private formatHover(hover: unknown): string {
    if (!hover || typeof hover !== 'object') return 'No hover information';

    const h = hover as { contents?: unknown };
    if (!h.contents) return 'No hover contents';

    if (typeof h.contents === 'string') {
      return h.contents;
    }

    if (typeof h.contents === 'object' && 'value' in (h.contents as object)) {
      return (h.contents as { value: string }).value;
    }

    if (Array.isArray(h.contents)) {
      return h.contents
        .map((c) => (typeof c === 'string' ? c : (c as { value?: string }).value || ''))
        .filter(Boolean)
        .join('\n\n');
    }

    return JSON.stringify(h.contents, null, 2);
  }

  private formatDiagnostics(diagnostics: unknown[]): string {
    if (diagnostics.length === 0) return 'No diagnostics';

    const severityMap: Record<number, string> = {
      1: 'Error',
      2: 'Warning',
      3: 'Info',
      4: 'Hint',
    };

    return diagnostics
      .map((d) => {
        const diag = d as {
          range?: { start?: { line?: number; character?: number } };
          severity?: number;
          message?: string;
          source?: string;
        };
        const line = (diag.range?.start?.line ?? 0) + 1;
        const char = (diag.range?.start?.character ?? 0) + 1;
        const severity = severityMap[diag.severity ?? 1] || 'Unknown';
        const source = diag.source ? `[${diag.source}]` : '';
        return `${severity} ${source} [${line}:${char}] ${diag.message || 'Unknown error'}`;
      })
      .join('\n');
  }

  private formatLocations(locations: unknown[]): string {
    return locations
      .map((loc) => {
        const l = loc as {
          uri?: string;
          range?: { start?: { line?: number; character?: number } };
        };
        const uri = l.uri?.replace('file://', '') || 'unknown';
        const line = (l.range?.start?.line ?? 0) + 1;
        const char = (l.range?.start?.character ?? 0) + 1;
        return `${uri}:${line}:${char}`;
      })
      .join('\n');
  }

  private formatSymbols(symbols: unknown[]): string {
    const kindMap: Record<number, string> = {
      1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
      6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
      11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
      15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
      20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
      25: 'Operator', 26: 'TypeParameter',
    };

    return symbols
      .slice(0, 50)
      .map((sym) => {
        const s = sym as {
          name?: string;
          kind?: number;
          location?: { uri?: string; range?: { start?: { line?: number } } };
          range?: { start?: { line?: number } };
        };
        const kind = kindMap[s.kind ?? 0] || 'Symbol';
        const line = (s.range?.start?.line ?? s.location?.range?.start?.line ?? 0) + 1;
        const uri = s.location?.uri?.replace('file://', '').split('/').pop() || '';
        const location = uri ? `${uri}:${line}` : `line ${line}`;
        return `${kind}: ${s.name || 'unnamed'} (${location})`;
      })
      .join('\n');
  }
}
