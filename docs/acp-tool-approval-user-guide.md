# ACP Tool Approval - User Experience Guide

**Date:** 2026-01-27  
**For:** Users of ACP-enabled editors (Zed, JetBrains, etc.)

---

## What is Tool Approval?

When the AI assistant needs to perform an action (read a file, run a command, modify code), it must ask for your permission first. This gives you control over what the AI can do.

---

## How Approval Works in ACP Clients

### The Flow

```
1. AI decides it needs to use a tool
   ↓
2. You see an approval prompt in your editor
   ↓
3. You choose: Allow or Reject
   ↓
4. Tool executes (or is skipped)
   ↓
5. AI continues with the results
```

---

## Real-World Examples

### Example 1: Reading a File (Safe Operation)

**AI Request:**
> "Let me read the configuration file"

**What You See:**

```
┌──────────────────────────────────────┐
│ 🤖 Permission Request               │
├──────────────────────────────────────┤
│ Tool: file_read                      │
│ Description: Read /project/config.json │
│                                      │
│ [Allow once]  [Allow always]  [✗ Reject] │
└──────────────────────────────────────┘
```

**You Click:** `[Allow once]`

**Result:** File is read, AI sees the contents

---

### Example 2: Editing a File (Moderate Risk)

**AI Request:**
> "I'll update the configuration"

**What You See:**

```
┌──────────────────────────────────────┐
│ 🤖 Permission Request               │
├──────────────────────────────────────┤
│ Tool: file_edit                      │
│ Description: Edit /etc/hosts          │
│                                      │
│ ⚠️  This could affect system settings │
│                                      │
│ [Allow once]  [Allow always]  [✗ Reject] │
└──────────────────────────────────────┘
```

**You Click:** `[✗ Reject]`

**Result:**
- Tool is NOT executed
- AI sees: "Permission denied for file_edit"
- AI cannot modify the file

---

### Example 3: Running Commands (High Risk)

**AI Request:**
> "I'll clean up the temporary directory"

**What You See:**

```
┌──────────────────────────────────────┐
│ 🤖 Permission Request               │
├──────────────────────────────────────┤
│ Tool: bash_tool                     │
│ Description: Execute command         │
│ Command: rm -rf /tmp/*              │
│                                      │
│ ⚠️  DANGEROUS COMMAND - This will    │
│     DELETE files permanently!       │
│                                      │
│ [✗ Reject]   [Allow once]  [Allow always] │
└──────────────────────────────────────┘
```

**You Click:** `[✗ Reject]`

**Result:**
- Dangerous command is blocked
- AI cannot delete your files
- You're safe! 🔒

---

## Approval Options Explained

### Allow Once
- **What it does:** Approves this tool execution one time
- **When to use:** Safe operations you want to review each time
- **Example:** Reading a file, listing directory contents

### Allow Always
- **What it does:** Approves this tool for the entire session
- **When to use:** Safe tools you use frequently
- **Example:** `file_read`, `ls_tool`, `grep_tool`
- **Note:** Some editors remember this preference

### Reject
- **What it does:** Blocks the tool from executing
- **When to use:** Dangerous operations or operations you don't want
- **Example:** `bash_tool` with dangerous commands, editing system files
- **Result:** AI sees error and cannot perform the action

---

## UI Variations

### Zed Editor

Zed shows tool approval prompts as inline notifications:

```
╭────────────────────────────────────────╮
│ 🤖 Allow file_read to read config.json?    │
│ [✓ Allow once]  [Allow always]  [✗ Reject]     │
╰────────────────────────────────────────╯
```

You can:
- Click the button you want
- Use keyboard shortcut (if configured)
- Move past the prompt without responding

### JetBrains IDEs

JetBrains shows approval as a popup dialog:

```
┌────────────────────────────────────┐
│ Tool Execution Approval           │
├────────────────────────────────────┤
│ Tool:      file_edit               │
│ Location:  /project/config.json    │
│                                   │
│ Remember my choice for session     │
│ [ ]                               │
│ [Allow]  [Deny]                    │
└────────────────────────────────────┘
```

---

## Protocol Messages

What actually happens between the editor and the AI assistant:

### 1. Permission Request Sent to Client

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess_abc123",
    "toolCall": {
      "toolCallId": "call_001",
      "title": "file_read",
      "kind": "read",
      "rawInput": {"path": "/project/config.json"}
    },
    "options": [
      {
        "optionId": "allow-once",
        "name": "Allow once",
        "kind": "allow_once"
      },
      {
        "optionId": "allow-always",
        "name": "Allow always",
        "kind": "allow_always"
      },
      {
        "optionId": "reject",
        "name": "Reject",
        "kind": "reject_once"
      }
    ]
  }
}
```

### 2. Your Response (When You Click)

If you click **[Allow once]**:
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "outcome": {
      "outcome": "selected",
      "optionId": "allow-once"
    }
  }
}
```

If you click **[Reject]**:
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "outcome": {
      "outcome": "selected",
      "optionId": "reject"
    }
  }
}
```

### 3. Tool Executes (if approved)

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "in_progress"
    }
  }
}
```

### 4. Tool Completes

```json
{
  "jsonrpc": "2.0",
  "method": "session/update",
  "params": {
    "sessionId": "sess_abc123",
    "update": {
      "sessionUpdate": "tool_call_update",
      "toolCallId": "call_001",
      "status": "completed",
      "rawOutput": "{ file content here }"
    }
  }
}
```

---

## User Experience Examples

### Scenario 1: AI Wants to Read Code

```
You: "Review the auth module"

AI: "I'll read the authentication module files"
     → Permission request appears
     → "Allow file_read to read src/auth.ts?"
     → You click [Allow once]

✅ File is read
✅ AI reviews the code
✅ Everyone is happy
```

### Scenario 2: AI Wants to Delete Files

```
You: "Clean up temp files"

AI: "I'll remove temporary files"
     → Permission request appears
     → "Allow bash_tool to execute rm -rf /tmp/*?"
     → You see the danger
     → You click [✗ Reject]

❌ Tool is blocked
✅ AI says: "Permission denied for bash_tool"
✅ Your files are safe
```

### Scenario 3: AI Wants to Edit Config

```
You: "Update the debug setting to true"

AI: "I'll modify config.json"
     → Permission request appears
     → "Allow file_edit to edit config.json?"
     → You review the change
     → You click [Allow once]

✅ File is edited
✅ AI confirms the change
```

---

## Tips for Users

### When to Allow Once

✅ **DO** use for:
- Reading files you want to review
- Editing code you want to check each time
- Running commands you want to verify
- First time using a tool

### When to Allow Always

✅ **DO** use for:
- Safe tools you use frequently
- Read operations (file_read, ls_tool)
- Search operations (grep_tool, glob_tool)
- ⚠️  Be selective - don't allow dangerous tools always

### When to Reject

✅ **DO** reject:
- Dangerous commands (rm, file editing system files)
- Commands in sensitive directories
- Operations you don't understand
- Commands you didn't trigger

⚠️  **Security Best Practice:**
- Review each tool call before approving
- Check the file path and arguments
- Reject if you're unsure
- Better to reject and ask for clarification

---

## Common Questions

### Q: What happens if I don't respond?
A: After 30 seconds, the request times out and is automatically denied for safety.

### Q: Can I undo after allowing?
A: No, once you click Allow, the tool executes immediately. Be careful!

### Q: What if the editor crashes?
A: The tool execution is cancelled. You won't accidentally approve something later.

### Q: Can I see what the tool will do before approving?
A: Yes! The approval prompt shows:
- Tool name (file_read, bash_tool, etc.)
- File paths or arguments
- Tool kind (read, edit, execute)
- Use this info to make informed decisions

### Q: Are all tools safe?
A: No! Some tools can:
- Delete files (bash_tool with rm)
- Modify your system (file_edit)
- Execute arbitrary commands
- **Always review before approving!**

### Q: Can I disable approval for safe tools?
A: Yes! Use "Allow always" for safe tools like file_read, ls_tool, grep_tool. They won't ask again during your session.

---

## Security Best Practices

### 🔒 **Always Review**

Before approving, check:
1. **Tool name** - Is it safe? (file_read ✅, bash_tool ⚠️)
2. **Arguments** - What files/commands are affected?
3. **Risk level** - Could this damage my system?

### ⚠️ **Red Flags**

**Reject immediately if:**
- Path includes `/etc/`, `/usr/`, `/bin/`, etc.
- Command includes `rm -rf`, `del`, `format`, etc.
- Tool kind is `execute` and you don't recognize the command
- Files you don't recognize or didn't ask to modify

### ✅ **Green Flags**

**Usually safe to approve:**
- Reading files in your project directory
- Searching for code patterns
- Listing directories
- Editing files in your project
- Running test commands

---

## Summary

**Tool Approval in ACP is designed for safety:**

1. **You see every tool request** before it happens
2. **You have 3 choices:** Allow once, Allow always, Reject
3. **You control what the AI can do** on your system
4. **Dangerous operations require explicit permission**
5. **You can review file paths and arguments**
6. **30-second timeout** prevents hanging requests

**You are in control!** 🔐
