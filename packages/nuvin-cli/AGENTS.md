# AGENTS.md

This file provides guidance to Nuvin cli when working with code in this repository.

## Common Development Commands

- Build the project: `pnpm build`
- Run in development mode with watch: `pnpm dev`
- Run CLI in development: `pnpm run:dev`
- Run tests: `pnpm test`
- Run a single test: `pnpm test <path/to/test.file>`
- Lint code: `pnpm lint`
- Format code: `pnpm format`

## High-Level Architecture

This is a React/Ink-based terminal user interface (TUI) application for an AI-powered CLI assistant.

### Core Structure
- **React/Ink Framework**: Used for rich terminal UI components and interactions
- **TypeScript**: Full TypeScript implementation with strict typing
- **@nuvin/nuvin-core**: Core orchestrator engine providing LLM provider support and tool execution

### Modular Architecture
The application follows a modular architecture organized into:
- **Components**: React components for the UI, including adapters, modals, and renderers
- **Contexts**: React contexts for state management (config, notifications, tool approval, themes, etc.)
- **Hooks**: Custom hooks for reactive logic and effects
- **Services**: Business logic services (orchestrator manager, agent creator, session metrics, etc.)
- **Utils**: Utility functions for common operations

### Key Systems
- **Multi-Agent System**: Supports delegation to specialist AI agents for complex tasks, with independent conversation contexts
- **Event-Driven Communication**: Uses EventBus for component communication
- **Command System**: Extensible command registry supporting both function and component-based commands
- **Model Context Protocol (MCP) Integration**: Extensible tool integration for external services
- **Layered Configuration System**: Configuration hierarchy (global, local, explicit, environment variables, CLI flags)
- **Theme System**: Customizable terminal themes with color schemes

### Build and Test Infrastructure
- **tsup**: Used for TypeScript bundling and compilation
- **Vitest**: Test runner with React component testing support
- **Biome**: Code linting and formatting tool

## Providers and Authentication

Supported AI providers include OpenRouter, Anthropic, GitHub Models, ZAI, and Echo (for testing). Authentication can be configured via environment variables or CLI flags.