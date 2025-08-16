# Tech Stack and Dependencies

## Backend (Go)
- **Go Version**: 1.23+
- **Framework**: Wails v2 for desktop application framework
- **Key Dependencies**:
  - `github.com/wailsapp/wails/v2` - Desktop framework
  - `github.com/google/uuid` - UUID generation
  - `github.com/pkg/browser` - Browser operations
  - `github.com/robotn/gohook` - Global shortcuts/hotkeys

## Frontend (React/TypeScript)
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Testing**: Vitest with React Testing Library

### Key Frontend Dependencies
- **UI/Styling**:
  - TailwindCSS v4 with custom theme system
  - Radix UI primitives (@radix-ui/react-*)
  - Lucide React for icons
  - class-variance-authority for CSS utilities
  
- **State/Data**:
  - Zustand for state management
  - React Router v7 for routing
  - @tanstack/react-virtual for virtual scrolling
  
- **Content Rendering**:
  - react-markdown for markdown rendering
  - mermaid for diagram rendering
  - remark-gfm for GitHub Flavored Markdown

- **Development Tools**:
  - @biomejs/biome for formatting and linting
  - @vitejs/plugin-react for Vite React support
  - jsdom for testing environment

## Code Quality Tools
- **Biome**: Primary tool for code formatting and linting
- **TypeScript**: Type checking and development experience
- **Vitest**: Testing framework with UI support
- **Wails**: Desktop development and hot reload