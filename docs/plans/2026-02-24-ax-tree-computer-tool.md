# Accessibility-Tree Computer Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the screenshot+coordinate computer tool with an accessibility-tree-based approach using a compiled Swift CLI helper (`ax-helper`) that dumps the macOS AX tree as JSON. The LLM selects elements by `ref` ID instead of pixel coordinates, making the tool work with any LLM — not just Anthropic's computer-use-trained models.

**Architecture:** A Swift binary (`ax-helper`) uses the native `AXUIElement` API to dump the UI tree as JSON (actions: `snapshot`, `press`, `set-value`, `list-apps`). `ComputerUseTool` shells out to `ax-helper` for element discovery and AX actions, keeps `cliclick` for keyboard/type, keeps `screencapture` for optional screenshots, removes coordinate-scaling logic. The tool sends a text-only element list instead of images for most interactions.

**Tech Stack:** Swift 5.9+ (system toolchain via `xcrun swift`), AXUIElement C API, existing cliclick (keyboard/mouse), existing screencapture (optional visual context).

---

## Design Decisions

### What changes from the current implementation

| Aspect | Before (screenshot+coords) | After (AX tree+refs) |
|--------|---------------------------|---------------------|
| Element discovery | LLM interprets screenshot pixels | LLM reads structured element list |
| Interaction target | `coordinate: [x, y]` | `ref: "42"` (element ID) |
| Click execution | `cliclick c:342,185` | `ax-helper press --ref 42` (uses AXPress or position fallback) |
| Screenshot | Required before every action | Optional (`screenshot` action still available) |
| Provider support | Claude only (needs trained model) | Any LLM |
| Result type | `mixed` (text + image) | `text` (element list) for snapshot, `mixed` for screenshot |

### What stays the same

- `cliclick` for `type`, `key`, `scroll` actions (keyboard/mouse primitives)
- `screencapture` for optional `screenshot` action
- `MacOSBackend` structure (add new methods, keep existing ones)
- `ComputerUseResult` type union (`mixed` | `text`)
- Orchestrator's mixed-result handling (unchanged)
- Setup command structure (add Swift compilation step)
- Test structure (mock backend)

### ax-helper Swift CLI spec

```
USAGE:
  ax-helper snapshot [--app <name>] [--max-depth <n>] [--max-elements <n>]
  ax-helper press --ref <id> --snapshot-id <uuid>
  ax-helper set-value --ref <id> --snapshot-id <uuid> --value <text>
  ax-helper list-apps

OUTPUT: JSON to stdout
```

**`snapshot` output:**
```json
{
  "snapshotId": "uuid-v4",
  "app": "Arc",
  "window": "GitHub",
  "elements": [
    { "ref": 1, "role": "AXButton", "title": "Save", "desc": null, "actions": ["AXPress"], "pos": [340, 185], "size": [80, 32] },
    { "ref": 2, "role": "AXTextField", "title": null, "desc": "Search", "value": "", "actions": ["AXPress"], "pos": [50, 45], "size": [200, 28] },
    { "ref": 3, "role": "AXStaticText", "title": "Welcome", "value": "Welcome back", "pos": [100, 300], "size": [200, 20] }
  ]
}
```

Key design:
- `snapshotId` is a UUID generated per snapshot — `press`/`set-value` require it to ensure the ref mapping is still valid
- The Swift binary stores the last snapshot's element-to-AXUIElement mapping in a temp file keyed by snapshotId
- `ref` is a sequential integer assigned during tree traversal
- Only "interesting" elements are included (has title/desc/value, or is actionable role)
- `--max-depth` defaults to 8, `--max-elements` defaults to 200

**`press` behavior:**
1. Load AXUIElement ref mapping from temp file by snapshotId
2. Look up element by ref ID
3. If element supports `AXPress` action → perform it
4. Else → get element's position+size, click center via CGEvent

**`list-apps` output:**
```json
["Finder", "Arc", "Slack", "Notes"]
```

### Tool parameter changes

**New actions:** `snapshot` (replaces screenshot for element discovery), `press`, `set_value`
**Kept actions:** `screenshot`, `type`, `key`, `scroll`, `wait`
**Removed actions:** `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `mouse_move`, `left_click_drag`
**Removed params:** `coordinate`, `start_coordinate`
**New params:** `ref` (element ref from snapshot), `app` (target app name), `value` (for set_value)

### LLM-facing element list format

For the `snapshot` result, we send a compact text representation:

```
[App: Arc | Window: GitHub]

[ref:1] button "Save" (340,185 80×32)
[ref:2] textfield "Search" value="" (50,45 200×28)
[ref:3] text "Welcome back" (100,300 200×20)
[ref:4] link "Skip to content" (200,100 120×16)
[ref:5] group "Global Navigation Menu" (0,0 1671×50)
  [ref:6] link "Homepage (g then d)" (10,10 40×30)
  [ref:7] button "Search or jump to..." (60,10 200×30)
```

Rules:
- Indent children under parent to show hierarchy
- Simplify AX roles: `AXButton` → `button`, `AXTextField` → `textfield`, `AXStaticText` → `text`, `AXLink` → `link`, etc.
- Show title/desc/value in quotes
- Show position and size for context
- Skip purely structural containers (AXGroup with no title/desc) unless they have interesting children

---

## Tasks

### Task 1: Create the Swift CLI helper source

**Files:**
- Create: `packages/nuvin-core/src/tools/computer/ax-helper/main.swift`

**Step 1: Write the Swift source**

The Swift binary handles four commands: `snapshot`, `press`, `set-value`, `list-apps`.

```swift
// main.swift — macOS Accessibility Tree Helper
// Compiled with: swiftc -O -o ax-helper main.swift -framework ApplicationServices

import ApplicationServices
import Foundation

// MARK: - Types

struct Element: Codable {
    let ref: Int
    let role: String
    let title: String?
    let desc: String?
    let value: String?
    let actions: [String]?
    let pos: [Int]?
    let size: [Int]?
    let children: [Element]?
}

struct SnapshotResult: Codable {
    let snapshotId: String
    let app: String
    let window: String?
    let elements: [Element]
}

struct ErrorResult: Codable {
    let error: String
}

// MARK: - AX Helpers

func getAttributeValue<T>(_ element: AXUIElement, _ attribute: String) -> T? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success else { return nil }
    return value as? T
}

func getPosition(_ element: AXUIElement) -> (Int, Int)? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, kAXPositionAttribute as String as CFString, &value)
    guard result == .success, let axValue = value else { return nil }
    var point = CGPoint.zero
    AXValueGetValue(axValue as! AXValue, .cgPoint, &point)
    return (Int(point.x), Int(point.y))
}

func getSize(_ element: AXUIElement) -> (Int, Int)? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, kAXSizeAttribute as String as CFString, &value)
    guard result == .success, let axValue = value else { return nil }
    var size = CGSize.zero
    AXValueGetValue(axValue as! AXValue, .cgSize, &size)
    return (Int(size.width), Int(size.height))
}

func getActions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    let result = AXUIElementCopyActionNames(element, &names)
    guard result == .success, let actionNames = names as? [String] else { return [] }
    return actionNames
}

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children: CFArray = getAttributeValue(element, kAXChildrenAttribute as String) else { return [] }
    return (0..<CFArrayGetCount(children)).compactMap { i in
        let ptr = CFArrayGetValueAtIndex(children, i)
        return (ptr as! AXUIElement)
    }
}

// MARK: - Role simplification

func simplifyRole(_ role: String) -> String {
    let map: [String: String] = [
        "AXButton": "button", "AXRadioButton": "radio", "AXCheckBox": "checkbox",
        "AXTextField": "textfield", "AXTextArea": "textarea", "AXStaticText": "text",
        "AXLink": "link", "AXImage": "image", "AXGroup": "group",
        "AXList": "list", "AXTable": "table", "AXRow": "row", "AXCell": "cell",
        "AXColumn": "column", "AXScrollArea": "scrollarea", "AXScrollBar": "scrollbar",
        "AXToolbar": "toolbar", "AXTabGroup": "tabgroup", "AXTab": "tab",
        "AXMenuItem": "menuitem", "AXMenu": "menu", "AXMenuBar": "menubar",
        "AXPopUpButton": "popup", "AXComboBox": "combobox", "AXSlider": "slider",
        "AXSplitGroup": "splitgroup", "AXSplitter": "splitter",
        "AXWindow": "window", "AXSheet": "sheet", "AXDialog": "dialog",
        "AXWebArea": "webarea", "AXHeading": "heading",
        "AXOutline": "outline", "AXDisclosureTriangle": "disclosure",
        "AXValueIndicator": "indicator",
    ]
    return map[role] ?? role.replacingOccurrences(of: "AX", with: "").lowercased()
}

// MARK: - Tree traversal

/// Flat ref → AXUIElement mapping (for later press/set-value)
var refMap: [Int: AXUIElement] = [:]

func traverseElement(_ element: AXUIElement, depth: Int, maxDepth: Int, maxElements: Int, counter: inout Int) -> Element? {
    guard depth <= maxDepth, counter < maxElements else { return nil }

    let role: String = getAttributeValue(element, kAXRoleAttribute as String) ?? "unknown"
    let title: String? = getAttributeValue(element, kAXTitleAttribute as String)
    let desc: String? = getAttributeValue(element, kAXDescriptionAttribute as String)
    let rawValue: AnyObject? = {
        var v: AnyObject?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &v)
        return v
    }()
    let value: String? = {
        guard let v = rawValue else { return nil }
        if let s = v as? String, !s.isEmpty, s.count < 100 { return s }
        return nil
    }()
    let actions = getActions(element).filter { $0 != "AXShowMenu" && $0 != "AXScrollToVisible" }
    let pos = getPosition(element)
    let size = getSize(element)

    // Determine if this element is "interesting" enough to include
    let isInteresting = title != nil || desc != nil || value != nil || !actions.isEmpty ||
        ["AXButton", "AXTextField", "AXTextArea", "AXLink", "AXCheckBox", "AXRadioButton",
         "AXPopUpButton", "AXComboBox", "AXSlider", "AXMenuItem", "AXTab",
         "AXHeading", "AXWebArea"].contains(role)

    // Traverse children regardless
    let childElements = getChildren(element)
    var childResults: [Element] = []
    for child in childElements {
        if let result = traverseElement(child, depth: depth + 1, maxDepth: maxDepth, maxElements: maxElements, counter: &counter) {
            childResults.append(result)
        }
    }

    // If not interesting and has no interesting descendants, skip
    if !isInteresting && childResults.isEmpty { return nil }

    counter += 1
    let ref = counter
    refMap[ref] = element

    return Element(
        ref: ref,
        role: simplifyRole(role),
        title: title,
        desc: desc,
        value: value,
        actions: actions.isEmpty ? nil : actions,
        pos: pos.map { [$0.0, $0.1] },
        size: size.map { [$0.0, $0.1] },
        children: childResults.isEmpty ? nil : childResults
    )
}

// MARK: - Commands

func snapshot(appName: String?, maxDepth: Int, maxElements: Int) {
    let systemWide = AXUIElementCreateSystemWide()

    // Get target app
    let appElement: AXUIElement
    let resolvedAppName: String

    if let name = appName {
        // Find specific app by name
        let workspace = NSWorkspace.shared
        guard let app = workspace.runningApplications.first(where: {
            $0.localizedName == name || $0.bundleIdentifier?.contains(name) == true
        }) else {
            printError("App '\(name)' not found or not running")
            return
        }
        appElement = AXUIElementCreateApplication(app.processIdentifier)
        resolvedAppName = app.localizedName ?? name
    } else {
        // Use frontmost app
        var focusedApp: AnyObject?
        let result = AXUIElementCopyAttributeValue(systemWide, kAXFocusedApplicationAttribute as CFString, &focusedApp)
        guard result == .success else {
            printError("Cannot get focused application. Grant Accessibility permission in System Settings.")
            return
        }
        appElement = (focusedApp as! AXUIElement)
        resolvedAppName = getAttributeValue(appElement, kAXTitleAttribute as String) ?? "Unknown"
    }

    // Get windows
    let windows: [AXUIElement] = {
        guard let w: CFArray = getAttributeValue(appElement, kAXWindowsAttribute as String) else { return [] }
        return (0..<CFArrayGetCount(w)).map { i in CFArrayGetValueAtIndex(w, i) as! AXUIElement }
    }()

    let windowTitle: String? = windows.first.flatMap { getAttributeValue($0, kAXTitleAttribute as String) }

    // Traverse the first window (or app if no windows)
    refMap = [:]
    var counter = 0
    let target = windows.first ?? appElement
    let rootElement = traverseElement(target, depth: 0, maxDepth: maxDepth, maxElements: maxElements, counter: &counter)

    let snapshotId = UUID().uuidString

    // Save ref map to temp file for later press/set-value
    // We serialize PIDs and element refs for reconstruction
    saveRefMap(snapshotId: snapshotId, appElement: appElement)

    let result = SnapshotResult(
        snapshotId: snapshotId,
        app: resolvedAppName,
        window: windowTitle,
        elements: rootElement?.children ?? (rootElement.map { [$0] } ?? [])
    )

    printJSON(result)
}

func pressElement(refId: Int, snapshotId: String) {
    guard let elementMap = loadRefMap(snapshotId: snapshotId) else {
        printError("Snapshot '\(snapshotId)' not found or expired")
        return
    }

    guard let element = elementMap[refId] else {
        printError("Element ref \(refId) not found in snapshot")
        return
    }

    // Try AXPress first
    let actions = getActions(element)
    if actions.contains("AXPress") {
        let result = AXUIElementPerformAction(element, "AXPress" as CFString)
        if result == .success {
            printJSON(["status": "pressed", "ref": refId, "method": "AXPress"])
            return
        }
    }

    // Fallback: click at element center
    if let pos = getPosition(element), let size = getSize(element) {
        let cx = pos.0 + size.0 / 2
        let cy = pos.1 + size.1 / 2
        let clickDown = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: CGPoint(x: cx, y: cy), mouseButton: .left)
        let clickUp = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: CGPoint(x: cx, y: cy), mouseButton: .left)
        clickDown?.post(tap: .cghidEventTap)
        usleep(50000) // 50ms
        clickUp?.post(tap: .cghidEventTap)
        printJSON(["status": "clicked", "ref": refId, "method": "CGEvent", "x": cx, "y": cy])
    } else {
        printError("Cannot press element \(refId): no AXPress action and no position available")
    }
}

func setValue(refId: Int, snapshotId: String, newValue: String) {
    guard let elementMap = loadRefMap(snapshotId: snapshotId) else {
        printError("Snapshot '\(snapshotId)' not found or expired")
        return
    }

    guard let element = elementMap[refId] else {
        printError("Element ref \(refId) not found in snapshot")
        return
    }

    // Try setting value directly
    let result = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, newValue as CFTypeRef)
    if result == .success {
        printJSON(["status": "set", "ref": refId, "value": newValue])
    } else {
        // Fallback: focus + type
        AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, true as CFTypeRef)
        usleep(100000) // 100ms
        printJSON(["status": "focused", "ref": refId, "note": "Value could not be set directly. Element focused — use 'type' action to enter text."])
    }
}

func listApps() {
    let workspace = NSWorkspace.shared
    let apps = workspace.runningApplications
        .filter { $0.activationPolicy == .regular }
        .compactMap { $0.localizedName }
        .sorted()
    printJSON(apps)
}

// MARK: - Ref map persistence

func refMapPath(snapshotId: String) -> String {
    return NSTemporaryDirectory() + "nuvin-ax-\(snapshotId).bin"
}

func saveRefMap(snapshotId: String, appElement: AXUIElement) {
    // We can't serialize AXUIElements directly. Instead, we keep the process alive
    // for press/set-value in a second invocation by re-traversing.
    // BUT — that's slow. Better approach: serialize the PID + element path.
    //
    // Simplest approach: keep the refMap in memory and use a different architecture:
    // The Swift binary runs in "server" mode or we just re-traverse on press.
    //
    // For v1: re-traverse on press (slower but no state management).
    // Store: { pid, snapshotId } in temp file
    var pid: pid_t = 0
    AXUIElementGetPid(appElement, &pid)

    let data: [String: Any] = ["pid": Int(pid), "snapshotId": snapshotId]
    if let jsonData = try? JSONSerialization.data(withJSONObject: data) {
        FileManager.default.createFile(atPath: refMapPath(snapshotId: snapshotId), contents: jsonData)
    }
}

func loadRefMap(snapshotId: String) -> [Int: AXUIElement]? {
    let path = refMapPath(snapshotId: snapshotId)
    guard let data = FileManager.default.contents(atPath: path),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let pid = json["pid"] as? Int else { return nil }

    // Re-traverse the app to rebuild refMap
    let appElement = AXUIElementCreateApplication(pid_t(pid))
    refMap = [:]
    var counter = 0

    let windows: [AXUIElement] = {
        guard let w: CFArray = getAttributeValue(appElement, kAXWindowsAttribute as String) else { return [] }
        return (0..<CFArrayGetCount(w)).map { i in CFArrayGetValueAtIndex(w, i) as! AXUIElement }
    }()

    let target = windows.first ?? appElement
    _ = traverseElement(target, depth: 0, maxDepth: 8, maxElements: 200, counter: &counter)

    // Clean up temp file
    try? FileManager.default.removeItem(atPath: path)

    return refMap
}

// MARK: - Output helpers

func printJSON<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    if let data = try? encoder.encode(value), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func printJSON(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func printJSON(_ value: [String]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func printError(_ message: String) {
    let error = ErrorResult(error: message)
    let encoder = JSONEncoder()
    if let data = try? encoder.encode(error), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(1)
}

// MARK: - Main

let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: ax-helper <snapshot|press|set-value|list-apps> [options]\n", stderr)
    exit(1)
}

switch args[1] {
case "snapshot":
    var appName: String?
    var maxDepth = 8
    var maxElements = 200
    var i = 2
    while i < args.count {
        switch args[i] {
        case "--app": i += 1; appName = args[i]
        case "--max-depth": i += 1; maxDepth = Int(args[i]) ?? 8
        case "--max-elements": i += 1; maxElements = Int(args[i]) ?? 200
        default: break
        }
        i += 1
    }
    snapshot(appName: appName, maxDepth: maxDepth, maxElements: maxElements)

case "press":
    var refId: Int?
    var snapshotId: String?
    var i = 2
    while i < args.count {
        switch args[i] {
        case "--ref": i += 1; refId = Int(args[i])
        case "--snapshot-id": i += 1; snapshotId = args[i]
        default: break
        }
        i += 1
    }
    guard let ref = refId, let sid = snapshotId else {
        printError("press requires --ref <id> and --snapshot-id <uuid>")
        exit(1)
    }
    pressElement(refId: ref, snapshotId: sid)

case "set-value":
    var refId: Int?
    var snapshotId: String?
    var newValue: String?
    var i = 2
    while i < args.count {
        switch args[i] {
        case "--ref": i += 1; refId = Int(args[i])
        case "--snapshot-id": i += 1; snapshotId = args[i]
        case "--value": i += 1; newValue = args[i]
        default: break
        }
        i += 1
    }
    guard let ref = refId, let sid = snapshotId, let val = newValue else {
        printError("set-value requires --ref <id>, --snapshot-id <uuid>, and --value <text>")
        exit(1)
    }
    setValue(refId: ref, snapshotId: sid, newValue: val)

case "list-apps":
    listApps()

default:
    printError("Unknown command: \(args[1])")
}
```

**Step 2: Verify it compiles**

Run:
```bash
cd packages/nuvin-core/src/tools/computer/ax-helper
swiftc -O -o ax-helper main.swift -framework ApplicationServices -framework AppKit
./ax-helper list-apps
./ax-helper snapshot
```

Expected: JSON output with list of apps / element tree.

**Step 3: Commit**

```bash
git add packages/nuvin-core/src/tools/computer/ax-helper/main.swift
git commit -m "feat(computer): add ax-helper Swift CLI source for AX tree access"
```

---

### Task 2: Add ax-helper compilation to setup command and backend

**Files:**
- Modify: `packages/nuvin-cli/source/modules/commands/definitions/setup.ts` — add compilation step
- Modify: `packages/nuvin-core/src/tools/computer/macos-backend.ts` — add `axSnapshot()`, `axPress()`, `axSetValue()`, `listApps()` methods

**Step 1: Update setup.ts to compile ax-helper**

Add after the cliclick check (line ~93):

```typescript
// 5. ax-helper (Swift accessibility helper)
const axHelperDir = path.join(__dirname, '..', '..', '..', '..', '..', 'nuvin-core', 'src', 'tools', 'computer', 'ax-helper');
const axHelperBin = path.join(os.homedir(), '.nuvin', 'bin', 'ax-helper');

// Check if already compiled
const axHelperExists = fs.existsSync(axHelperBin);
if (axHelperExists) {
  console.log(`${INDENT}${PASS} ${chalk.bold('ax-helper')} — compiled Swift accessibility helper`);
} else {
  console.log(`${INDENT}${WARN} ${chalk.bold('ax-helper')} — not compiled, building...`);
  // Ensure bin dir exists
  fs.mkdirSync(path.join(os.homedir(), '.nuvin', 'bin'), { recursive: true });
  const swiftSrc = path.join(axHelperDir, 'main.swift');
  const compileResult = spawnSync('swiftc', ['-O', '-o', axHelperBin, swiftSrc, '-framework', 'ApplicationServices', '-framework', 'AppKit'], {
    stdio: 'pipe', encoding: 'utf8', timeout: 60000,
  });
  if (compileResult.status === 0) {
    console.log(`${INDENT}${PASS} ${chalk.bold('ax-helper')} — compiled successfully`);
  } else {
    console.log(`${INDENT}${FAIL} ${chalk.bold('ax-helper')} — compilation failed`);
    console.log(`${INDENT}     ${chalk.dim(compileResult.stderr?.slice(0, 200) ?? '')}`);
  }
}
```

**Step 2: Add AX methods to MacOSBackend**

Add to `macos-backend.ts`:

```typescript
// ─── ax-helper path resolution ─────────────────────────────────────────

function getAxHelperPath(): string {
  const binPath = path.join(os.homedir(), '.nuvin', 'bin', 'ax-helper');
  if (!fs.existsSync(binPath)) {
    throw new Error(
      'ax-helper is not compiled. Run: /setup computer-use\n' +
      'ax-helper is required for accessibility-tree-based desktop automation.'
    );
  }
  return binPath;
}
```

Add these methods to the `MacOSBackend` class:

```typescript
async axSnapshot(appName?: string, maxDepth?: number, maxElements?: number): Promise<AXSnapshotResult> {
  const axHelper = getAxHelperPath();
  const args = ['snapshot'];
  if (appName) args.push('--app', appName);
  if (maxDepth) args.push('--max-depth', String(maxDepth));
  if (maxElements) args.push('--max-elements', String(maxElements));

  const result = await exec(axHelper, args);
  if (result.code !== 0) {
    throw new Error(`ax-helper snapshot failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as AXSnapshotResult;
}

async axPress(ref: number, snapshotId: string): Promise<AXPressResult> {
  const axHelper = getAxHelperPath();
  const result = await exec(axHelper, ['press', '--ref', String(ref), '--snapshot-id', snapshotId]);
  if (result.code !== 0) {
    throw new Error(`ax-helper press failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as AXPressResult;
}

async axSetValue(ref: number, snapshotId: string, value: string): Promise<AXSetValueResult> {
  const axHelper = getAxHelperPath();
  const result = await exec(axHelper, ['set-value', '--ref', String(ref), '--snapshot-id', snapshotId, '--value', value]);
  if (result.code !== 0) {
    throw new Error(`ax-helper set-value failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as AXSetValueResult;
}

async listApps(): Promise<string[]> {
  const axHelper = getAxHelperPath();
  const result = await exec(axHelper, ['list-apps']);
  if (result.code !== 0) {
    throw new Error(`ax-helper list-apps failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout) as string[];
}
```

**Step 3: Add AX result types to types.ts**

Add to `packages/nuvin-core/src/tools/computer/types.ts`:

```typescript
// ─── AX tree types ──────────────────────────────────────────────────────

export type AXElement = {
  ref: number;
  role: string;
  title?: string | null;
  desc?: string | null;
  value?: string | null;
  actions?: string[] | null;
  pos?: [number, number] | null;
  size?: [number, number] | null;
  children?: AXElement[] | null;
};

export type AXSnapshotResult = {
  snapshotId: string;
  app: string;
  window: string | null;
  elements: AXElement[];
};

export type AXPressResult = {
  status: string;
  ref: number;
  method: string;
  x?: number;
  y?: number;
};

export type AXSetValueResult = {
  status: string;
  ref: number;
  value?: string;
  note?: string;
};
```

**Step 4: Update ComputerBackend interface**

Add to the `ComputerBackend` interface:

```typescript
axSnapshot(appName?: string, maxDepth?: number, maxElements?: number): Promise<AXSnapshotResult>;
axPress(ref: number, snapshotId: string): Promise<AXPressResult>;
axSetValue(ref: number, snapshotId: string, value: string): Promise<AXSetValueResult>;
listApps(): Promise<string[]>;
```

**Step 5: Run tsc**

```bash
cd packages/nuvin-core && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add -A
git commit -m "feat(computer): add AX backend methods, types, and setup compilation"
```

---

### Task 3: Rewrite ComputerUseTool for AX-tree-based interaction

**Files:**
- Modify: `packages/nuvin-core/src/tools/ComputerUseTool.ts` — new action set, ref-based dispatch, AX snapshot formatting

**Step 1: Rewrite the tool**

Replace the entire action set with:

```
Actions:
  snapshot   — Take AX tree snapshot of frontmost app (or --app). Returns text element list.
  press      — Press element by ref ID (from last snapshot)
  set_value  — Set value on element by ref ID
  type       — Type text using keyboard (existing cliclick)
  key        — Press key combination (existing cliclick)
  scroll     — Scroll (existing python3+Quartz)
  screenshot — Take visual screenshot (existing screencapture) — optional, for visual context
  wait       — Wait N milliseconds
  list_apps  — List running GUI applications
```

New params schema:

```typescript
const PARAMETERS = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['snapshot', 'press', 'set_value', 'type', 'key', 'scroll', 'screenshot', 'wait', 'list_apps'],
      description: 'The action to perform. Always start with `snapshot` to see available UI elements.',
    },
    ref: {
      type: 'integer',
      description: 'Element ref ID from the last snapshot (for press, set_value actions).',
    },
    app: {
      type: 'string',
      description: 'Target app name (for snapshot action). Omit to use the frontmost app.',
    },
    text: {
      type: 'string',
      description: 'Text to type (for type action) or value to set (for set_value action).',
    },
    key: {
      type: 'string',
      description: 'Key or combo to press (for key action). Examples: "Return", "cmd+s", "ctrl+a".',
    },
    direction: {
      type: 'string',
      enum: ['up', 'down', 'left', 'right'],
      description: 'Scroll direction (for scroll action).',
    },
    amount: {
      type: 'integer',
      minimum: 1,
      description: 'Scroll lines (for scroll action). Defaults to 3.',
    },
    duration: {
      type: 'integer',
      minimum: 0,
      description: 'Milliseconds to wait (for wait action). Defaults to 1000.',
    },
  },
  required: ['action'],
} as const;
```

Key changes in dispatch:
- Remove all `coordinate`/`start_coordinate` params and `scaleCoord()` logic
- `snapshot` → calls `backend.axSnapshot()`, formats tree as text, stores `lastSnapshotId`
- `press` → calls `backend.axPress(ref, lastSnapshotId)`
- `set_value` → calls `backend.axSetValue(ref, lastSnapshotId, text)`
- `screenshot` → unchanged (still returns mixed with image)
- `type`, `key`, `scroll`, `wait` — unchanged

Add a helper to format the AX tree as human-readable text:

```typescript
function formatAXTree(snapshot: AXSnapshotResult): string {
  const lines: string[] = [];
  lines.push(`[App: ${snapshot.app}${snapshot.window ? ` | Window: ${snapshot.window}` : ''}]`);
  lines.push('');

  function formatElement(el: AXElement, indent: number) {
    const pad = '  '.repeat(indent);
    const parts: string[] = [`${pad}[ref:${el.ref}]`, el.role];

    const label = el.title || el.desc;
    if (label) parts.push(`"${label}"`);
    if (el.value) parts.push(`value="${el.value}"`);
    if (el.actions?.length) parts.push(`{${el.actions.join(',')}}`);

    lines.push(parts.join(' '));

    if (el.children) {
      for (const child of el.children) {
        formatElement(child, indent + 1);
      }
    }
  }

  for (const el of snapshot.elements) {
    formatElement(el, 0);
  }

  return lines.join('\n');
}
```

**Step 2: Update ComputerUseParams type**

```typescript
export type ComputerUseParams = {
  action: 'snapshot' | 'press' | 'set_value' | 'type' | 'key' | 'scroll' | 'screenshot' | 'wait' | 'list_apps';
  ref?: number;
  app?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  amount?: number;
  duration?: number;
};
```

**Step 3: Update tool description**

```typescript
description:
  'Interact with the computer desktop via the accessibility tree. ' +
  'Use `snapshot` to see all UI elements, then `press` or `set_value` to interact by element ref. ' +
  'Use `type` and `key` for keyboard input, `scroll` for scrolling. ' +
  'Use `screenshot` only when you need visual context (e.g., images, layout). ' +
  'Always start with `snapshot` or `list_apps` to orient yourself.',
```

**Step 4: Run tsc**

```bash
cd packages/nuvin-core && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/tools/ComputerUseTool.ts
git commit -m "feat(computer): rewrite tool for AX-tree-based interaction with ref IDs"
```

---

### Task 4: Update validators, type guards, and params

**Files:**
- Modify: `packages/nuvin-core/src/tools/tool-validators.ts` — update `computerToolSchema` for new params
- Modify: `packages/nuvin-core/src/tools/tool-params.ts` — update `ComputerUseArgs`
- Modify: `packages/nuvin-core/src/index.ts` — add new type exports (`AXElement`, `AXSnapshotResult`, etc.)

**Step 1: Update computerToolSchema**

```typescript
export const computerToolSchema = z.object({
  action: z.enum(['snapshot', 'press', 'set_value', 'type', 'key', 'scroll', 'screenshot', 'wait', 'list_apps']),
  ref: z.number().int().optional(),
  app: z.string().optional(),
  text: z.string().optional(),
  key: z.string().optional(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().min(1).optional(),
  duration: z.number().int().min(0).optional(),
});
```

**Step 2: Update ComputerUseArgs**

```typescript
export type ComputerUseArgs = {
  action: string;
  ref?: number;
  app?: string;
  text?: string;
  key?: string;
  direction?: string;
  amount?: number;
  duration?: number;
};
```

**Step 3: Export new types from index.ts**

```typescript
export type { AXElement, AXSnapshotResult, AXPressResult, AXSetValueResult } from './tools/computer/types.js';
```

**Step 4: Run tsc for both packages**

```bash
cd packages/nuvin-core && npx tsc --noEmit
cd packages/nuvin-cli && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat(computer): update validators, params, and exports for AX-tree tool"
```

---

### Task 5: Update ToolCallViewer registry for new actions

**Files:**
- Modify: `packages/nuvin-cli/source/components/ToolCallViewer/registry.ts` — update computer tool display

**Step 1: Update display names and running messages**

Update the `computer` entry in the registry to handle new actions:

```typescript
computer: {
  displayName: (args) => {
    const action = args?.action;
    switch (action) {
      case 'snapshot': return args?.app ? `Snapshot: ${args.app}` : 'AX Snapshot';
      case 'press': return `Press ref:${args?.ref}`;
      case 'set_value': return `Set value ref:${args?.ref}`;
      case 'screenshot': return 'Screenshot';
      case 'type': return 'Type text';
      case 'key': return `Key: ${args?.key}`;
      case 'scroll': return `Scroll ${args?.direction}`;
      case 'wait': return `Wait ${args?.duration ?? 1000}ms`;
      case 'list_apps': return 'List apps';
      default: return 'Computer';
    }
  },
  renderResult: null,
  collapsedByDefault: true,
},
```

**Step 2: Run tsc**

```bash
cd packages/nuvin-cli && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/components/ToolCallViewer/registry.ts
git commit -m "feat(computer): update ToolCallViewer for AX-tree actions"
```

---

### Task 6: Update agent system prompt

**Files:**
- Modify: `packages/nuvin-cli/source/agents/nuvin-agent.md` — update computer tool documentation

**Step 1: Update the computer tool section in the system prompt**

Add/update the computer tool guidance:

```markdown
### Computer Tool (Desktop Automation)
- Use `snapshot` first to see available UI elements in the frontmost app
- Use `list_apps` to see what applications are running
- Interact with elements by `ref` ID from the last snapshot
- `press` clicks buttons/links, `set_value` fills text fields
- `type` and `key` work without a ref (keyboard input goes to focused element)
- `screenshot` provides visual context when the element tree isn't sufficient
- Take a new `snapshot` after any action that changes the UI
```

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/agents/nuvin-agent.md
git commit -m "docs(agent): update system prompt for AX-tree computer tool"
```

---

### Task 7: Rewrite tests

**Files:**
- Modify: `packages/nuvin-core/tests/computer-use-tool.test.ts` — rewrite for new actions
- Modify: `packages/nuvin-core/tests/computer-use-backend.test.ts` — add AX method tests

**Step 1: Rewrite computer-use-tool.test.ts**

Create a mock backend that implements the new AX methods:

```typescript
const mockBackend: ComputerBackend = {
  // existing methods
  screenshot: vi.fn().mockResolvedValue({ ... }),
  typeText: vi.fn().mockResolvedValue(undefined),
  pressKey: vi.fn().mockResolvedValue(undefined),
  scroll: vi.fn().mockResolvedValue(undefined),
  // new AX methods
  axSnapshot: vi.fn().mockResolvedValue({
    snapshotId: 'test-uuid',
    app: 'TestApp',
    window: 'Test Window',
    elements: [
      { ref: 1, role: 'button', title: 'Save', actions: ['AXPress'], pos: [10, 20], size: [80, 30] },
      { ref: 2, role: 'textfield', desc: 'Search', value: '', pos: [100, 20], size: [200, 28] },
    ],
  }),
  axPress: vi.fn().mockResolvedValue({ status: 'pressed', ref: 1, method: 'AXPress' }),
  axSetValue: vi.fn().mockResolvedValue({ status: 'set', ref: 2, value: 'hello' }),
  listApps: vi.fn().mockResolvedValue(['Finder', 'Arc', 'Notes']),
};
```

Test cases:
- `snapshot` returns formatted text with app/window header and element list
- `press` requires ref, passes to backend with stored snapshotId
- `press` without prior snapshot returns error
- `set_value` requires ref and text
- `list_apps` returns app list as text
- `type`, `key`, `scroll`, `wait` — unchanged behavior
- `screenshot` — still returns mixed result with image

**Step 2: Update backend tests**

Add tests for the new AX methods (mocking `exec` calls to `ax-helper`).

**Step 3: Run all tests**

```bash
cd packages/nuvin-core && npx vitest run
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add packages/nuvin-core/tests/computer-use-*.test.ts
git commit -m "test(computer): rewrite tests for AX-tree-based tool"
```

---

### Task 8: Update setup command to remove python3/Quartz check (optional)

**Note:** Python3+Quartz is still needed for scroll. Keep the check but deprioritize it. The primary dependency is now `ax-helper` compilation.

**Step 1: Reorder setup checks**

New order:
1. macOS guard
2. ax-helper compilation (most important)
3. cliclick
4. screencapture
5. python3 + Quartz (for scroll)
6. Permission reminders (Accessibility is critical, Screen Recording only needed for screenshot)

**Step 2: Commit**

```bash
git add packages/nuvin-cli/source/modules/commands/definitions/setup.ts
git commit -m "chore(setup): reorder computer-use checks, prioritize ax-helper"
```

---

### Task 9: Final verification

**Step 1: Full tsc check**

```bash
cd packages/nuvin-core && npx tsc --noEmit
cd packages/nuvin-cli && npx tsc --noEmit
```

**Step 2: Full test suite**

```bash
cd packages/nuvin-core && npx vitest run
```

**Step 3: Manual test**

```bash
# In nuvin CLI
/setup computer-use
# Then in conversation:
# "Take a snapshot of the screen and tell me what you see"
# "Click the Save button"
```

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(computer): accessibility-tree-based desktop automation with ax-helper"
```

---

## Dependency graph

```
Task 1 (Swift source)
  └→ Task 2 (Backend + Setup + Types)
       └→ Task 3 (Rewrite ComputerUseTool)
            ├→ Task 4 (Validators/Params/Exports)
            ├→ Task 5 (ToolCallViewer)
            └→ Task 6 (System prompt)
       └→ Task 7 (Tests) — can start after Task 3
  Task 8 (Setup reorder) — independent, after Task 2
  Task 9 (Verification) — after all tasks
```

Tasks 4, 5, 6 can be done in parallel after Task 3.
Task 7 can be done in parallel with Tasks 4-6.
Task 8 is independent after Task 2.
