# Suggested Commands for Development

## Essential Development Commands

### Frontend Development
```bash
cd nuvin-ui/frontend
pnpm install              # Install dependencies
pnpm run dev              # Start development server
pnpm run build            # Production build
pnpm run format           # Format code with Biome
pnpm run test             # Run tests
pnpm run test:ui          # Run tests with interactive UI
pnpm run test:run         # Run tests once
pnpm run test:coverage    # Run tests with coverage
pnpm run preview          # Preview production build
```

### Desktop Application (Wails)
```bash
cd nuvin-ui
wails dev                 # Development mode with hot reload (MAIN DEV COMMAND)
wails build               # Build production executable
go run .                  # Run Go backend directly
```

### Root Project Commands
```bash
# From project root
pnpm run dev              # Run frontend dev (delegates to nuvin-ui/frontend)
pnpm run build            # Build frontend (delegates)
pnpm run format           # Format frontend code (delegates)
pnpm run test             # Run frontend tests (delegates)
```

### Code Quality Commands
```bash
cd nuvin-ui/frontend
pnpm exec biome format --write    # Format with Biome
pnpm exec biome check             # Check formatting and linting
pnpm exec biome check --write     # Auto-fix issues
```

### Git and Version Control
```bash
git status                # Check repository status
git add .                 # Stage changes
git commit -m "message"   # Commit changes
git push                  # Push to remote
```

## System-Specific Commands (macOS)
- `ls` - List directory contents
- `cd` - Change directory
- `grep` - Search text (prefer `rg` if available)
- `find` - Find files
- `open .` - Open current directory in Finder

## Most Important Commands for Task Completion
1. **Primary Development**: `cd nuvin-ui && wails dev`
2. **Code Formatting**: `cd nuvin-ui/frontend && pnpm run format`
3. **Run Tests**: `cd nuvin-ui/frontend && pnpm run test`
4. **Production Build**: `cd nuvin-ui && wails build`