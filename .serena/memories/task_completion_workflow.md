# Task Completion Workflow

## Required Steps When Completing Tasks

### 1. Code Quality Checks
Always run these commands before considering a task complete:

```bash
cd nuvin-ui/frontend
pnpm run format           # Format code with Biome
pnpm run test             # Run all tests
```

### 2. Build Verification
Ensure the application builds successfully:

```bash
cd nuvin-ui/frontend
pnpm run build            # Verify frontend builds

cd nuvin-ui
wails build               # Verify desktop app builds (if significant changes)
```

### 3. Development Testing
Test changes in development mode:

```bash
cd nuvin-ui
wails dev                 # Start development mode and test functionality
```

### 4. Type Checking
TypeScript type checking is included in the build process, but can be run separately:

```bash
cd nuvin-ui/frontend
npx tsc --noEmit          # Type check without emitting files
```

## Quality Gates
- ✅ All tests pass (`pnpm run test`)
- ✅ Code is properly formatted (`pnpm run format`)
- ✅ TypeScript types are correct (no build errors)
- ✅ Application builds successfully
- ✅ Functionality works in development mode

## Testing Strategy
- **Unit Tests**: For utilities, services, and core logic
- **Component Tests**: For React components using React Testing Library
- **Integration Tests**: For complex workflows and agent interactions
- **Manual Testing**: In development mode for user-facing features

## Git Workflow
1. Make changes in feature branch
2. Run quality checks
3. Commit with descriptive messages
4. Push to remote branch
5. Create pull request (if applicable)

## Performance Considerations
- Check for console errors/warnings in development
- Verify memory usage for large conversations
- Test streaming functionality for real-time features
- Validate MCP server integrations work properly

## Documentation Updates
When making significant changes:
- Update relevant README sections
- Update CLAUDE.md if architecture changes
- Add/update type definitions
- Update component documentation if public API changes