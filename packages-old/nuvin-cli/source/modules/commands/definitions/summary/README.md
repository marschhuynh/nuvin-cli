# Summary Command Module

This module implements the `/summary` command with two modes:
- **Standard mode**: LLM-based summarization
- **Beta mode**: Compression algorithm

## File Structure

```
summary/
├── index.ts              # Command registration and handler
├── types.ts              # TypeScript interfaces
├── compression.ts        # Main compression algorithm
├── file-operations.ts    # File operation analysis
├── bash-operations.ts    # Bash operation analysis
└── README.md            # This file
```

## Module Breakdown

### `types.ts`
Defines shared TypeScript interfaces:
- `FileOperation` - Tracks file reads/edits/creates
- `BashOperation` - Tracks bash command executions
- `CompressionStats` - Statistics returned by compression

### `file-operations.ts`
Handles file operation analysis:
- `extractFilePath()` - Extract file path from tool call
- `analyzeFileOperations()` - Find all file operations
- `isStaleFileRead()` - Check if file read is superseded
- `isStaleFileEdit()` - Check if file edit is superseded

### `bash-operations.ts`
Handles bash command analysis:
- `extractBashCommand()` - Extract command from tool call
- `analyzeBashOperations()` - Find all bash executions
- `isStaleBashCommand()` - Check if same command ran later
- `hasErrors()` - Detect error patterns in output

### `compression.ts`
Main compression algorithm:
- `compressConversation()` - Orchestrates all compression strategies
- Returns compressed messages and statistics

### `index.ts`
Command registration:
- `registerSummaryCommand()` - Registers `/summary` command
- Handles both standard and beta modes
- Manages UI feedback and error handling

## Usage

```bash
# Standard LLM-based summary
/summary

# Beta compression mode
/summary beta
```

## Compression Strategy

The beta mode removes:
1. **Stale file reads** - Files read before being edited/created
2. **Stale file edits** - Intermediate edits, keeps only final
3. **Stale bash commands** - Same command executed multiple times
4. **Failed bash commands** - Commands with error output

## Future Enhancements

- Content truncation for large tool outputs
- Semantic clustering of related operations
- Custom compression rules via configuration
