# Specialist Agents Guide

Nuvin CLI features a powerful multi-agent system for delegating complex tasks to specialized AI agents. Each agent is optimized for specific workflows and can work independently or collaboratively.

## Using Specialist Agents

You can interact with specialist agents in three ways:

### 1. Direct Delegation (Natural Language)

Simply mention the task in natural language:

```
"Delegate code review to the specialist agent"
"Have the quality tester create tests for this module"
"Ask the architect to design this feature"
```

### 2. Using the `/agent` Command

Use the interactive agent management interface:

```bash
/agent                    # Opens agent selection menu
```

### 3. Using the `assign_task` Tool

The main agent can automatically delegate tasks to specialists:

```
"I need a comprehensive code review of my recent changes"
# → Automatically delegates to code-reviewer agent

"Create tests for all functions in this file"
# → Automatically delegates to quality-tester agent
```

## Creating Specialist Agents

Nuvin CLI supports custom specialist agents through configuration. You can create your own agents by defining them in your agent registry.

### Agent Definition

Agents are defined with:
- **Name/ID**: Unique identifier for the agent
- **Description**: What the agent specializes in
- **System Prompt**: Instructions that define the agent's behavior
- **Tools**: Available tools the agent can use
- **Model**: LLM model to use for this agent

### Example Agent Types

You can create agents for various purposes:

**Code Analysis Agents:**
- Code reviewers for quality checks
- Security auditors for vulnerability scanning
- Performance analyzers for optimization

**Development Agents:**
- Test generators for creating test suites
- Documentation writers for API docs
- Code refactoring specialists

**Research Agents:**
- Documentation researchers for API exploration
- Best practices advisors
- Technology evaluators

**Project Management Agents:**
- Commit organizers for git hygiene
- Task planners for project breakdown
- Progress trackers

### Creating Your First Agent

1. Define agent configuration in your config file
2. Specify system prompt and tools
3. Register in agent registry
4. Test with the `/agent` command

See the configuration guide for detailed agent setup instructions.

## Multi-Agent Architecture

### Agent Collaboration

Agents can work together in complex workflows:

- **Code-reviewer** identifies issues → **Solution-architect** suggests fixes
- **Document-researcher** gathers info → **Solution-architect** designs implementation
- **Quality-tester** creates tests → **Code-reviewer** validates test quality

### Delegation Flow

```
User Request → Main Agent → Task Analysis
                                ↓
                ┌───────────────┴───────────────┐
                ↓                               ↓
          Direct Response              Delegate to Specialist
                ↓                               ↓
          Response to User           Specialist Agent Execution
                                                ↓
                                     Results → Main Agent → User
```

### System Components

1. **Main Agent (Orchestrator)**
   - Handles user interactions
   - Routes tasks to appropriate specialist agents
   - Coordinates multi-agent workflows
   - Manages conversation context

2. **Specialist Agents**
   - Independent AI agents with specialized prompts
   - Each agent has domain-specific tools and knowledge
   - Can be invoked directly or automatically by main agent
   - Support for nested delegation (agents can delegate to other agents)

3. **Agent Registry**
   - Centralized registry of all available agents
   - Dynamic agent loading and initialization
   - Configuration-based agent enabling/disabling

## Example Workflows

### Code Review Workflow

```
User: "Review my recent code changes"
→ Main Agent delegates to custom code-reviewer agent
→ Agent analyzes changes using file tools
→ Returns detailed review with suggestions
→ Main Agent presents results to user
```

### Testing Workflow

```
User: "Create tests for all my functions"
→ Main Agent delegates to custom quality-tester agent
→ Agent analyzes code and generates tests
→ Writes test files using file_new tool
→ Main Agent confirms tests created
```

### Research Workflow

```
User: "Research the best practices for React hooks"
→ Main Agent delegates to custom research agent
→ Agent searches documentation and examples
→ Compiles findings and recommendations
→ Main Agent presents research summary
```

## Advanced Features

### Agent Context Isolation

Each specialist agent operates in its own context:
- Independent conversation history
- Separate tool execution environment
- Isolated state management
- Clean handoff back to main agent

### Tool Access Control

Agents can be configured with specific tool permissions:
- File operations (read, write, edit)
- Web search and fetch
- Bash execution
- Custom tools via MCP

### Performance Optimization

- Agents run with optimized token usage
- Context compression for long conversations
- Selective tool availability
- Efficient prompt engineering

## Best Practices

### When to Use Specialist Agents

✅ **Good use cases:**
- Complex, specialized tasks requiring focused expertise
- Tasks benefiting from dedicated system prompts
- Multi-step workflows needing isolation
- Tasks requiring different tool permissions

❌ **Avoid for:**
- Simple questions the main agent can answer
- Tasks requiring frequent user interaction
- One-off quick operations
- Real-time conversational tasks

### Designing Effective Agents

1. **Clear Purpose**: Each agent should have a well-defined specialty
2. **Appropriate Tools**: Give agents only the tools they need
3. **Focused Prompts**: Keep system prompts specific and actionable
4. **Error Handling**: Design agents to handle failures gracefully
5. **Documentation**: Document what each agent does and when to use it
