# Nuvin Hook System

Hooks intercept agent behavior at lifecycle points, allowing custom scripts to validate, modify, or block operations.

## Quick Start

Add hooks to your agent's frontmatter:

```yaml
---
name: my-agent
hooks:
  pre_tool_use:
    - matcher: "bash_tool"
      command:
        command: "./scripts/validate-bash.sh"
        timeout: 30
---
```

## Hook Events

| Event | When it fires | Common use cases |
|-------|--------------|------------------|
| `session_start` | Agent session begins | Initialize logging, set up environment |
| `session_end` | Agent session ends | Cleanup, save metrics |
| `pre_user_prompt` | Before processing user message | Input validation, content filtering |
| `pre_tool_use` | Before tool execution | Validate commands, check permissions |
| `post_tool_use` | After tool execution | Audit logging, result validation |
| `permission_request` | When tool needs approval | **Desktop notifications**, custom approval logic |
| `pre_sub_agent` | Before spawning sub-agent | Rate limiting, resource checks |
| `post_sub_agent` | After sub-agent completes | Result aggregation |
| `pre_stop` | Before agent stops | Final cleanup |

## Hook Definition

```yaml
hooks:
  <event_type>:
    - matcher: "regex_pattern"    # Optional: only run for matching tools
      command:
        command: "./script.sh"    # Script to execute
        timeout: 60               # Timeout in seconds (default: 60)
      enabled: true               # Optional: disable without removing
      once: true                  # Optional: run only once per session
```

## Exit Codes

Your hook script's exit code controls behavior:

| Exit Code | Behavior |
|-----------|----------|
| `0` | Success - continue execution |
| `1` | Error - continue with warning logged |
| `2` | Block - stop execution, deny the operation |

## JSON Output

Hook scripts can return JSON to stdout for richer control:

```json
{
  "continue": true,
  "decision": "allow",
  "updatedInput": { "cmd": "sanitized-command" },
  "additionalContext": "Hook validation passed",
  "stopReason": "Blocked by security policy"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `continue` | boolean | Whether to proceed (default: true) |
| `decision` | string | "allow", "deny", "ask", "block" |
| `updatedInput` | object | Modified tool input parameters |
| `additionalContext` | string | Context added to agent's response |
| `stopReason` | string | Reason shown when blocking |

## Environment Variables

These variables are available in your hook scripts:

| Variable | Description |
|----------|-------------|
| `NUVIN_SESSION_ID` | Current session identifier |
| `NUVIN_CONVERSATION_ID` | Current conversation identifier |
| `NUVIN_MESSAGE_ID` | Current message identifier |
| `NUVIN_HOOK_EVENT` | Event type (e.g., "pre_tool_use") |
| `NUVIN_CWD` | Current working directory |
| `NUVIN_TOOL_NAME` | Tool being executed (for tool events) |
| `NUVIN_TOOL_USE_ID` | Unique tool invocation ID |
| `NUVIN_TOOL_INPUT` | Tool input as JSON string |

## Examples

### Block Dangerous Commands

```yaml
hooks:
  pre_tool_use:
    - matcher: "bash_tool"
      command:
        command: "./hooks/block-dangerous.sh"
```

```bash
#!/bin/bash
# hooks/block-dangerous.sh

DANGEROUS_PATTERNS="rm -rf|mkfs|dd if=|:(){ :|fork bomb"

if echo "$NUVIN_TOOL_INPUT" | grep -qE "$DANGEROUS_PATTERNS"; then
  echo '{"continue": false, "stopReason": "Dangerous command blocked"}'
  exit 2
fi

echo '{"continue": true}'
exit 0
```

### Audit All Tool Calls

```yaml
hooks:
  post_tool_use:
    - command:
        command: "./hooks/audit-log.sh"
```

```bash
#!/bin/bash
# hooks/audit-log.sh

LOG_FILE="$HOME/.nuvin/audit.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "$TIMESTAMP | $NUVIN_SESSION_ID | $NUVIN_TOOL_NAME | $NUVIN_TOOL_INPUT" >> "$LOG_FILE"
echo '{"continue": true}'
```

### Sanitize File Paths

```yaml
hooks:
  pre_tool_use:
    - matcher: "file_read|file_edit|file_new"
      command:
        command: "./hooks/sanitize-paths.sh"
```

```bash
#!/bin/bash
# hooks/sanitize-paths.sh

# Block access outside project directory
PROJECT_DIR=$(pwd)
INPUT_PATH=$(echo "$NUVIN_TOOL_INPUT" | jq -r '.path // .file_path // ""')

REAL_PATH=$(realpath -m "$INPUT_PATH" 2>/dev/null || echo "$INPUT_PATH")

if [[ ! "$REAL_PATH" =~ ^"$PROJECT_DIR" ]]; then
  echo "{\"continue\": false, \"stopReason\": \"Access denied: $INPUT_PATH is outside project\"}"
  exit 2
fi

echo '{"continue": true}'
```

### Require Confirmation for Write Operations

```yaml
hooks:
  pre_tool_use:
    - matcher: "file_edit|file_new"
      command:
        command: "./hooks/confirm-write.sh"
```

```bash
#!/bin/bash
# hooks/confirm-write.sh

# Return "ask" decision to trigger user confirmation
echo '{"continue": true, "decision": "ask", "additionalContext": "This will modify files"}'
```

### Rate Limit Sub-Agents

```yaml
hooks:
  pre_sub_agent:
    - command:
        command: "./hooks/rate-limit.sh"
        timeout: 5
```

```bash
#!/bin/bash
# hooks/rate-limit.sh

RATE_FILE="/tmp/nuvin-subagent-rate-$NUVIN_SESSION_ID"
MAX_PER_MINUTE=10

# Count recent invocations
NOW=$(date +%s)
CUTOFF=$((NOW - 60))

# Clean old entries and count
if [ -f "$RATE_FILE" ]; then
  RECENT=$(awk -v cutoff="$CUTOFF" '$1 > cutoff' "$RATE_FILE" | wc -l)
else
  RECENT=0
fi

if [ "$RECENT" -ge "$MAX_PER_MINUTE" ]; then
  echo '{"continue": false, "stopReason": "Rate limit exceeded: max 10 sub-agents per minute"}'
  exit 2
fi

# Record this invocation
echo "$NOW" >> "$RATE_FILE"
echo '{"continue": true}'
```

### Session Logging

```yaml
hooks:
  session_start:
    - command:
        command: "./hooks/session-start.sh"
  session_end:
    - command:
        command: "./hooks/session-end.sh"
```

```bash
#!/bin/bash
# hooks/session-start.sh
echo "[$(date)] Session started: $NUVIN_SESSION_ID" >> ~/.nuvin/sessions.log
echo '{"continue": true}'
```

```bash
#!/bin/bash
# hooks/session-end.sh
echo "[$(date)] Session ended: $NUVIN_SESSION_ID" >> ~/.nuvin/sessions.log
echo '{"continue": true}'
```

### Tool Approval Notification (Desktop Alert)

Show a desktop notification when a tool requires user approval. This is useful when you're working in another window and want to be notified when the agent needs your attention.

**Configuration in `~/.nuvin/config.yaml`:**

```yaml
hooks:
  permission_request:
    - command:
        command: "~/.nuvin/hooks/tool-approval-notification.sh"
        timeout: 5
```

**Cross-platform notification script:**

```bash
#!/bin/bash
# ~/.nuvin/hooks/tool-approval-notification.sh
# Shows desktop notification when a tool requires approval

TOOL_NAME="$NUVIN_TOOL_NAME"
MESSAGE="🔔 Tool approval required"

if [ -n "$TOOL_NAME" ]; then
    MESSAGE="🔔 Tool approval required: $TOOL_NAME"
fi

# Detect platform and show appropriate notification
case "$(uname -s)" in
    Darwin)
        # macOS - use osascript for native notification
        osascript -e "display notification \"$MESSAGE\" with title \"Nuvin\" sound name \"Glass\"" 2>/dev/null || true
        ;;
    Linux)
        # Linux - use notify-send if available
        if command -v notify-send &> /dev/null; then
            notify-send "Nuvin" "$MESSAGE" -i dialog-information 2>/dev/null || true
        fi
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Windows (Git Bash / WSL) - use PowerShell toast notification
        powershell.exe -Command "
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            \$template = '<toast><visual><binding template=\"ToastGeneric\"><text>Nuvin</text><text>$MESSAGE</text></binding></visual></toast>'
            \$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            \$xml.LoadXml(\$template)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Nuvin').Show(\$xml)
        " 2>/dev/null || true
        ;;
esac

# Always continue - this hook is informational only
echo '{"continue": true}'
exit 0
```

**Make the script executable:**

```bash
chmod +x ~/.nuvin/hooks/tool-approval-notification.sh
```

**macOS-only simpler version:**

```yaml
hooks:
  permission_request:
    - command:
        command: osascript -e 'display notification "Tool approval required: '$NUVIN_TOOL_NAME'" with title "Nuvin" sound name "Glass"' && echo '{"continue": true}'
        timeout: 5
```

## Multiple Hook Sources

Hooks can be registered from multiple sources. All matching hooks execute in sequence:

1. **Agent-specific hooks** - Defined in agent frontmatter
2. **Global hooks** - Defined in global configuration

If any hook returns `continue: false`, execution stops immediately.

## Pattern Matching

The `matcher` field uses JavaScript regex:

```yaml
# Match single tool
matcher: "bash_tool"

# Match multiple tools
matcher: "file_read|file_edit|file_new"

# Match pattern
matcher: "file_.*"

# Match all (omit matcher)
- command:
    command: "./hooks/audit-all.sh"
```

## Timeouts

- Default timeout: 60 seconds
- Timeout triggers `continue: true` with error logged
- Set explicit timeout for long-running hooks:

```yaml
command:
  command: "./slow-check.sh"
  timeout: 120  # 2 minutes
```

## Debugging

1. **Check hook output**: Hook stdout/stderr is captured in results
2. **Test manually**: Run your script with environment variables set
3. **Use logging**: Write to a log file from your hook script

```bash
# Test a hook manually
NUVIN_SESSION_ID=test \
NUVIN_TOOL_NAME=bash_tool \
NUVIN_TOOL_INPUT='{"cmd":"ls"}' \
./hooks/validate-bash.sh
```
