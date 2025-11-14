---
'@nuvin/nuvin-cli': minor
---

**Help Bar Feature:**

- Add help bar above input area showing keyboard shortcuts
  - Displays 'Ctrl+E show detail · ESC×2 stop · / command'
  - Uses single border line for clean appearance
  - Highlighted shortcuts in accent color

**Tool Result Display Improvements:**

- Simplify file_new display to match file_read pattern
  - Normal mode: Shows only file path and status (└─ Created)
  - Explain mode: Shows full file content with Markdown rendering
  - Add FileNewRenderer for better tool result visualization
  - Update ToolContentRenderer to conditionally render based on explain mode

**Display Refinements:**

- Clean up file_read and file_new result display
  - Hide 'Done' line for file_read and file_new in normal mode
  - Show 'Done' line only in explain mode when content is displayed
  - Restructure shouldShowResult logic to separate status line from content

**Status Handling:**

- Add 'denied by user' status handling in ToolResultView
  - Detect denial in error messages
  - Show 'Denied' status in yellow/warning color
  - Consistent with 'Aborted' status handling

**Explain Mode Footer:**

- Update Footer for explain mode
  - Show only 'Ctrl+E to toggle' message when in explain mode
  - Hide all other status info (provider, model, tokens, costs)
  - Provides focused, minimal interface in explain mode
