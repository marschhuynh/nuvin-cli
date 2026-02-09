# Customizing the Main Nuvin Agent

The main Nuvin agent prompt can be customized to suit your preferences.

## How It Works

- **Built-in**: Nuvin ships with a default prompt (shown as `[main]` in the agent list)
- **Global Override**: Create `~/.nuvin/agents/nuvin.md` to customize for all projects
- **Local Override**: Create `.nuvin/agents/nuvin.md` to customize for current project only

Priority: Local > Global > Built-in

## Editing the Main Agent

### Via UI

1. Run `nuvin` and press `Ctrl+A` to open agent manager
2. Select the `nuvin` agent (marked with `[main]`)
3. Press `Enter` to edit
4. A global override (`~/.nuvin/agents/nuvin.md`) will be created automatically
5. Edit the prompt as needed
6. Save with `Ctrl+S`
7. Restart Nuvin to apply changes

### Manually

Create or edit `~/.nuvin/agents/nuvin.md`:

```markdown
---
name: nuvin
description: Your custom description
allowed_tools:
  - file_read
  - file_edit
  # ... etc
temperature: 0.7
---

Your custom prompt goes here...
```

## Reverting to Default

Delete your override file:

```bash
rm ~/.nuvin/agents/nuvin.md  # Global
rm .nuvin/agents/nuvin.md    # Local
```

Restart Nuvin to use the built-in prompt.

## Tips

- Keep `name: nuvin` - the system looks for this name
- Include all necessary tools in `allowed_tools`
- Changes require restart to take effect
- Test your changes incrementally
