# Nuvin Agent - Project Overview

## Purpose
Nuvin Agent is a multi-platform desktop application for managing AI agents and providers. It provides a unified interface for communicating with both local LLM providers (OpenAI, Anthropic, GitHub Copilot, OpenRouter) and remote A2A (Agent-to-Agent) compatible agents.

## Key Features
- Multi-Agent Support (local and remote agents)
- Provider Management (OpenAI, Anthropic, GitHub Copilot, OpenRouter)
- GitHub Integration with OAuth authentication
- Cross-Platform desktop application (macOS, Windows, Linux)
- Real-time streaming communication
- Conversation history and management
- MCP (Model Context Protocol) server integration for tool support
- Built-in tool system (calculator, time, random, bash, todo management)

## Architecture
- **Frontend**: React 18 + TypeScript + TailwindCSS + Radix UI
- **Backend**: Go with Wails v2 framework for desktop integration
- **State Management**: Zustand for client-side state
- **Build Tool**: Vite for frontend bundling
- **Package Manager**: pnpm for dependency management

## Tech Stack Summary
- Go 1.23+ (backend)
- Node.js 18+ and pnpm (frontend tooling)
- Wails v2 (desktop framework)
- React 18 with TypeScript
- TailwindCSS v4 with custom theme system
- Radix UI primitives for accessible components
- Zustand for state management
- React Router v7 for routing
- Vitest for testing
- Biome for code formatting and linting