// ax-helper: macOS Accessibility Tree CLI
//
// Provides snapshot/press/set-value/list-apps commands via native AXUIElement API.
//
// Compile:
//   swiftc -O -o ax-helper main.swift -framework ApplicationServices -framework AppKit -framework CoreText
//
// Usage:
//   ax-helper snapshot [--app <name>] [--max-depth <n>] [--max-elements <n>]
//   ax-helper press --ref <id> --snapshot-id <uuid>
//   ax-helper set-value --ref <id> --snapshot-id <uuid> --value <text>
//   ax-helper scroll (--ref <id> --snapshot-id <uuid> | --x <n> --y <n>) [--dx <n>] [--dy <n>] [--app <name>]
//   ax-helper list-apps

import Foundation
import ApplicationServices
import AppKit

// ─── JSON helpers ──────────────────────────────────────────────────────────

func outputJSON(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}

func exitWithError(_ message: String) -> Never {
    outputJSON(["error": message])
    exit(1)
}

// ─── Role simplification ───────────────────────────────────────────────────

let roleMap: [String: String] = [
    "AXButton":            "button",
    "AXTextField":         "textfield",
    "AXTextArea":          "textarea",
    "AXStaticText":        "text",
    "AXLink":              "link",
    "AXImage":             "image",
    "AXCheckBox":          "checkbox",
    "AXRadioButton":       "radio",
    "AXComboBox":          "combobox",
    "AXPopUpButton":       "popupbutton",
    "AXMenuButton":        "menubutton",
    "AXMenuItem":          "menuitem",
    "AXMenu":              "menu",
    "AXMenuBar":           "menubar",
    "AXMenuBarItem":       "menubaritem",
    "AXSlider":            "slider",
    "AXProgressIndicator": "progressbar",
    "AXTab":               "tab",
    "AXTabGroup":          "tabgroup",
    "AXTable":             "table",
    "AXRow":               "row",
    "AXColumn":            "column",
    "AXCell":              "cell",
    "AXList":              "list",
    "AXOutline":           "outline",
    "AXTree":              "tree",
    "AXScrollArea":        "scrollarea",
    "AXScrollBar":         "scrollbar",
    "AXSplitGroup":        "splitgroup",
    "AXSplitter":          "splitter",
    "AXGroup":             "group",
    "AXWindow":            "window",
    "AXSheet":             "sheet",
    "AXDrawer":            "drawer",
    "AXDialog":            "dialog",
    "AXApplication":       "application",
    "AXToolbar":           "toolbar",
    "AXHeading":           "heading",
    "AXWebArea":           "webarea",
    "AXBusyIndicator":     "spinner",
    "AXDisclosureTriangle":"disclosure",
    "AXIncrementor":       "stepper",
    "AXValueIndicator":    "valueindicator",
    "AXColorWell":         "colorwell",
    "AXLayoutArea":        "layoutarea",
    "AXLayoutItem":        "layoutitem",
    "AXSortButton":        "sortbutton",
    "AXSearchField":       "searchfield",
    "AXHandle":            "handle",
    "AXGrowArea":          "growarea",
    "AXUnknown":           "unknown",
]

func simplifyRole(_ axRole: String) -> String {
    return roleMap[axRole] ?? axRole.replacingOccurrences(of: "AX", with: "").lowercased()
}

// ─── Actionable roles (always include even without label) ──────────────────

let actionableRoles: Set<String> = [
    "AXButton", "AXTextField", "AXTextArea", "AXLink", "AXCheckBox",
    "AXRadioButton", "AXComboBox", "AXPopUpButton", "AXMenuButton",
    "AXMenuItem", "AXSlider", "AXTab", "AXCell", "AXRow",
    "AXSearchField", "AXDisclosureTriangle", "AXIncrementor",
    "AXColorWell", "AXSortButton", "AXWebArea",
]

/// Noise actions we do not surface to the caller.
let noiseActions: Set<String> = ["AXShowMenu", "AXScrollToVisible"]

// ─── AXUIElement attribute helpers ────────────────────────────────────────

func getAttribute<T>(_ element: AXUIElement, _ attribute: String) -> T? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let v = value else { return nil }
    return (v as! T)
}

func getStringAttribute(_ element: AXUIElement, _ attribute: String) -> String? {
    return getAttribute(element, attribute) as String?
}

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children = getAttribute(element, kAXChildrenAttribute) as CFArray? else { return [] }
    let count = CFArrayGetCount(children)
    var result: [AXUIElement] = []
    result.reserveCapacity(count)
    for i in 0..<count {
        let child = CFArrayGetValueAtIndex(children, i)
        // swiftlint:disable:next force_cast
        result.append(unsafeBitCast(child, to: AXUIElement.self))
    }
    return result
}

func getActions(_ element: AXUIElement) -> [String] {
    var names: CFArray?
    guard AXUIElementCopyActionNames(element, &names) == .success,
          let arr = names else { return [] }
    let count = CFArrayGetCount(arr)
    var result: [String] = []
    for i in 0..<count {
        let name = unsafeBitCast(CFArrayGetValueAtIndex(arr, i), to: CFString.self) as String
        if !noiseActions.contains(name) {
            result.append(name)
        }
    }
    return result
}

func getPosition(_ element: AXUIElement) -> CGPoint? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &value) == .success,
          let axVal = value else { return nil }
    var point = CGPoint.zero
    guard AXValueGetValue(axVal as! AXValue, .cgPoint, &point) else { return nil }
    return point
}

func getSize(_ element: AXUIElement) -> CGSize? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &value) == .success,
          let axVal = value else { return nil }
    var size = CGSize.zero
    guard AXValueGetValue(axVal as! AXValue, .cgSize, &size) else { return nil }
    return size
}

// ─── Element representation ────────────────────────────────────────────────

struct AXElement {
    let ref: Int
    let role: String
    let title: String?
    let desc: String?
    let value: String?
    let actions: [String]
    let pos: CGPoint?
    let size: CGSize?
    let children: [AXElement]?
}

/// Controls how elements are serialized for snapshot output.
enum HintMode: String {
    case full          // All elements get refs (current behavior)
    case leafOnly      // Only leaf-actionable elements get refs; parents keep structure but ref=-1
    case leafCompact   // Collapse non-leaf-actionable parents; only leaf-actionable nodes + minimal ancestors
}

/// Returns true if any descendant of `el` has non-empty actions.
func hasActionableDescendant(_ el: AXElement) -> Bool {
    guard let children = el.children else { return false }
    for child in children {
        if !child.actions.isEmpty { return true }
        if hasActionableDescendant(child) { return true }
    }
    return false
}

/// Is this element "leaf actionable" — has actions but no actionable descendants?
func isLeafActionable(_ el: AXElement) -> Bool {
    return !el.actions.isEmpty && !hasActionableDescendant(el)
}

func elementToDict(_ el: AXElement, mode: HintMode = .full) -> [String: Any] {
    switch mode {
    case .full:
        return elementToDictFull(el)
    case .leafOnly:
        return elementToDictLeafOnly(el)
    case .leafCompact:
        // Returns nil for pruned nodes; caller handles
        return elementToDictLeafCompact(el) ?? [:]
    }
}

/// Full mode: every element gets its ref.
func elementToDictFull(_ el: AXElement) -> [String: Any] {
    var dict: [String: Any] = [
        "ref": el.ref,
        "role": el.role,
    ]
    if let t = el.title, !t.isEmpty { dict["title"] = t }
    if let d = el.desc, !d.isEmpty  { dict["desc"] = d }
    if let v = el.value, !v.isEmpty { dict["value"] = v }
    if !el.actions.isEmpty { dict["actions"] = el.actions }
    if let p = el.pos  { dict["pos"]  = [Int(p.x), Int(p.y)] }
    if let s = el.size { dict["size"] = [Int(s.width), Int(s.height)] }
    if let kids = el.children {
        dict["children"] = kids.map { elementToDictFull($0) }
    }
    return dict
}

/// Leaf-only mode: tree structure preserved, but only leaf-actionable elements get a ref.
/// Non-leaf-actionable parents have ref omitted (no ref key in dict).
func elementToDictLeafOnly(_ el: AXElement) -> [String: Any] {
    let showRef = el.actions.isEmpty || isLeafActionable(el)
    var dict: [String: Any] = [
        "role": el.role,
    ]
    if showRef {
        dict["ref"] = el.ref
    }
    if let t = el.title, !t.isEmpty { dict["title"] = t }
    if let d = el.desc, !d.isEmpty  { dict["desc"] = d }
    if let v = el.value, !v.isEmpty { dict["value"] = v }
    if showRef && !el.actions.isEmpty { dict["actions"] = el.actions }
    if let p = el.pos  { dict["pos"]  = [Int(p.x), Int(p.y)] }
    if let s = el.size { dict["size"] = [Int(s.width), Int(s.height)] }
    if let kids = el.children {
        dict["children"] = kids.map { elementToDictLeafOnly($0) }
    }
    return dict
}

/// Compact an action name string.
/// macOS custom actions arrive as "Name:pin\nTarget:0x0\nSelector:(null)" —
/// we extract only the Name portion and strip the standard AX prefix.
/// Standard AX names like "AXPress" are simplified to "Press".
func compactActionName(_ raw: String) -> String {
    // Custom app action: "Name:foo\nTarget:...\nSelector:..."
    if raw.hasPrefix("Name:") {
        let rest = raw.dropFirst(5) // drop "Name:"
        // take only up to first newline
        if let nl = rest.firstIndex(of: "\n") {
            return String(rest[rest.startIndex..<nl])
        }
        return String(rest)
    }
    // Standard AX action: "AXPress" → "Press"
    if raw.hasPrefix("AX") {
        return String(raw.dropFirst(2))
    }
    return raw
}

/// Compact an actions array: deduplicate, strip noise, return nil if empty.
func compactActions(_ actions: [String]) -> [String]? {
    let names = actions.map { compactActionName($0) }
    // Deduplicate preserving order
    var seen = Set<String>()
    let unique = names.filter { seen.insert($0).inserted }
    return unique.isEmpty ? nil : unique
}

/// Whether a container node is a transparent structural wrapper:
/// no ref (non-actionable), no meaningful metadata, and exactly one filtered child.
func isTransparentWrapper(_ el: AXElement) -> Bool {
    let hasLabel = (el.title?.isEmpty == false) || (el.desc?.isEmpty == false) || (el.value?.isEmpty == false)
    return el.actions.isEmpty && !hasLabel
}

/// Roles that are list-like containers where uniform child sizes can be hoisted.
let listContainerRoles: Set<String> = ["table", "list", "outline"]

/// Leaf-compact mode: prune non-actionable structure nodes.
/// Only leaf-actionable elements and ancestors needed to reach them are kept.
/// Returns nil if this subtree has no leaf-actionable elements.
///
/// Optimisations applied vs the naïve version:
///   1. Action names: `"Name:pin\nTarget:0x0\nSelector:(null)"` → `"pin"`, key `"act"` instead of `"actions"`
///   2. Transparent single-child wrappers collapsed (row→cell→row→cell chains flattened)
///   3. Uniform child sizes hoisted as `"rowSize"` on list containers, omitted from each child
func elementToDictLeafCompact(_ el: AXElement) -> [String: Any]? {
    // ── Editable content roles (e.g. AXWebArea, AXTextArea) always appear as leaves,
    // even when they have no AX actions — they are settable via AXValue / focus+type.
    let editableLeafRoles: Set<String> = ["webarea", "textarea"]

    // ── Leaf-actionable node ──────────────────────────────────────────────
    if isLeafActionable(el) || editableLeafRoles.contains(el.role) {
        var dict: [String: Any] = [
            "ref": el.ref,
            "role": el.role,
        ]
        if let t = el.title, !t.isEmpty { dict["title"] = t }
        if let d = el.desc, !d.isEmpty  { dict["desc"] = d }
        if let v = el.value, !v.isEmpty { dict["value"] = v }
        if let act = compactActions(el.actions) { dict["act"] = act }
        if let p = el.pos  { dict["pos"]  = [Int(p.x), Int(p.y)] }
        if let s = el.size { dict["size"] = [Int(s.width), Int(s.height)] }
        return dict
    }

    // ── Non-leaf: recurse, keep only branches with actionable descendants ─
    guard let kids = el.children else { return nil }
    let filteredKids = kids.compactMap { elementToDictLeafCompact($0) }
    guard !filteredKids.isEmpty else { return nil }

    // ── Transparent single-child wrapper: collapse ────────────────────────
    // If this node carries no semantic info and has exactly one filtered child,
    // return that child directly (eliminates row→cell→row→cell depth chains).
    if isTransparentWrapper(el) && filteredKids.count == 1 {
        return filteredKids[0]
    }

    var dict: [String: Any] = ["role": el.role]
    if let t = el.title, !t.isEmpty { dict["title"] = t }
    if let d = el.desc, !d.isEmpty  { dict["desc"] = d }

    // ── rowSize hoisting for uniform list containers ───────────────────────
    // If every filtered child has the same "size" value, hoist it to the
    // parent as "rowSize" and omit it from each child.
    if listContainerRoles.contains(el.role) {
        let sizes = filteredKids.compactMap { $0["size"] as? [Int] }
        if sizes.count == filteredKids.count,
           let first = sizes.first,
           sizes.allSatisfy({ $0 == first }) {
            dict["rowSize"] = first
            let stripped = filteredKids.map { child -> [String: Any] in
                var c = child
                c.removeValue(forKey: "size")
                return c
            }
            dict["children"] = stripped
            return dict
        }
    }

    dict["children"] = filteredKids
    return dict
}

// ─── Snapshot traversal ────────────────────────────────────────────────────

/// Counter and ref→element map, threaded through traversal.
final class SnapshotContext {
    var nextRef: Int = 1
    var refMap: [Int: AXUIElement] = [:]
    /// Count of actionable elements (those with AX actions) — used for the cap.
    var actionableCount: Int = 0
    let maxElements: Int

    init(maxElements: Int) {
        self.maxElements = maxElements
    }

    var isFull: Bool { actionableCount >= maxElements }
}

/// Returns true if element is "interesting" (worth including in output).
func isInteresting(role: String, title: String?, desc: String?, value: String?, actions: [String]) -> Bool {
    if actionableRoles.contains(role) { return true }
    if let t = title, !t.isEmpty { return true }
    if let d = desc,  !d.isEmpty { return true }
    if let v = value, !v.isEmpty { return true }
    if actions.contains("AXPress") { return true }
    return false
}

/// Traverse element tree, building AXElement hierarchy.
/// Returns nil if the subtree has no interesting elements.
func traverse(
    _ element: AXUIElement,
    depth: Int,
    maxDepth: Int,
    ctx: SnapshotContext,
    hintMode: HintMode = .full
) -> AXElement? {
    if ctx.isFull { return nil }

    let role    = getStringAttribute(element, kAXRoleAttribute) ?? "AXUnknown"
    let title   = getStringAttribute(element, kAXTitleAttribute)
    let desc    = getStringAttribute(element, kAXDescriptionAttribute)
    let rawValue = getAttribute(element, kAXValueAttribute) as CFTypeRef?
    // Convert value to String only if it is actually a string (avoid raw CFNumber noise)
    let value: String?
    if let rv = rawValue {
        if CFGetTypeID(rv) == CFStringGetTypeID() {
            value = rv as? String
        } else {
            value = nil
        }
    } else {
        value = nil
    }
    let actions = getActions(element)
    let pos     = getPosition(element)
    let size    = getSize(element)

    let interesting = isInteresting(role: role, title: title, desc: desc, value: value, actions: actions)

    // In leafCompact mode: skip child recursion for roles that are self-contained
    // actionable leaves — their subtrees add no independently actionable controls.
    // This avoids expensive IPC into rich-text bodies, note preview cells, etc.
    let contentLeafRoles: Set<String> = [
        "AXTextArea", "AXTextField", "AXWebArea", "AXStaticText",
        "AXTextGroup", "AXLayoutArea",
    ]
    // Also skip children when this element has actions and is a list-item role:
    // the cell/row itself is the leaf we want; its text/image children are decorative.
    let listItemRoles: Set<String> = ["AXCell", "AXRow"]
    let skipChildren = hintMode == .leafCompact && (
        contentLeafRoles.contains(role) ||
        (listItemRoles.contains(role) && !actions.isEmpty)
    )

    // Recurse into children if we haven't hit max depth (and recursion not skipped)
    var childElements: [AXElement]? = nil
    if !skipChildren && depth < maxDepth {
        let rawChildren = getChildren(element)
        if !rawChildren.isEmpty {
            var built: [AXElement] = []
            for child in rawChildren {
                if ctx.isFull { break }
                if let childEl = traverse(child, depth: depth + 1, maxDepth: maxDepth, ctx: ctx, hintMode: hintMode) {
                    built.append(childEl)
                }
            }
            if !built.isEmpty {
                childElements = built
            }
        }
    }

    // Include this node only if it (or a descendant) is interesting
    guard interesting || childElements != nil else { return nil }

    // In leafCompact mode, only leaf-actionable elements get a ref (dense numbering).
    // "Leaf-actionable" = has actions AND no descendant with actions.
    // Non-leaf nodes still appear in the AXElement tree for elementToDictLeafCompact
    // to traverse, but with ref=-1 (pruned from output).
    let ref: Int
    let builtElement = AXElement(
        ref: -1, role: simplifyRole(role), title: title, desc: desc,
        value: value, actions: actions, pos: pos, size: size, children: childElements
    )
    if hintMode == .leafCompact {
        // Editable content areas (e.g. Mail compose body) may have no AX actions
        // but are still settable via AXValue — always assign a ref.
        let editableContentRoles: Set<String> = ["AXWebArea", "AXTextArea"]
        if isLeafActionable(builtElement) || editableContentRoles.contains(role) {
            ref = ctx.nextRef
            ctx.nextRef += 1
            ctx.refMap[ref] = element
        } else {
            ref = -1
        }
    } else {
        ref = ctx.nextRef
        ctx.nextRef += 1
        ctx.refMap[ref] = element
    }
    if !actions.isEmpty {
        ctx.actionableCount += 1
    }

    return AXElement(
        ref: ref,
        role: builtElement.role,
        title: title,
        desc: desc,
        value: value,
        actions: actions,
        pos: pos,
        size: size,
        children: childElements
    )
}

// ─── App resolution ────────────────────────────────────────────────────────

/// Returns the PID and display name of the frontmost app (or matching by name).
func resolveApp(named appName: String?) -> (pid_t, String)? {
    let workspace = NSWorkspace.shared
    let runningApps = workspace.runningApplications

    if let name = appName {
        let lower = name.lowercased()
        for app in runningApps {
            guard app.activationPolicy == .regular else { continue }
            let appDisplayName = app.localizedName ?? ""
            if appDisplayName.lowercased() == lower || appDisplayName.lowercased().hasPrefix(lower) {
                return (app.processIdentifier, appDisplayName)
            }
        }
        return nil
    } else {
        // Frontmost app
        if let front = workspace.frontmostApplication {
            return (front.processIdentifier, front.localizedName ?? "Unknown")
        }
        return nil
    }
}

// ─── Snapshot persistence ──────────────────────────────────────────────────

let computerDir: String = {
    let dir = NSHomeDirectory() + "/.nuvin/computer"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    return dir
}()

func snapshotPath(snapshotId: String) -> String {
    return "\(computerDir)/ax-\(snapshotId).bin"
}

struct SnapshotMeta: Codable {
    let snapshotId: String
    let pid: Int32
    let appName: String
    let hintMode: String  // "full", "leafOnly", "leafCompact"
}

func saveSnapshotMeta(_ meta: SnapshotMeta) {
    let path = snapshotPath(snapshotId: meta.snapshotId)
    if let data = try? JSONEncoder().encode(meta) {
        try? data.write(to: URL(fileURLWithPath: path))
    }
}

func loadSnapshotMeta(snapshotId: String) -> SnapshotMeta? {
    let path = snapshotPath(snapshotId: snapshotId)
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let meta = try? JSONDecoder().decode(SnapshotMeta.self, from: data) else {
        return nil
    }
    return meta
}

// ─── Window helpers ──────────────────────────────────────────────────────

/// Get windows for an app, sorted deterministically by position (y, then x)
/// so that window ordering is stable across snapshot → press/set-value calls
/// even if macOS z-order changes in between.
func getSortedWindows(_ appElement: AXUIElement) -> [AXUIElement] {
    guard let windows = getAttribute(appElement, kAXWindowsAttribute) as CFArray? else {
        return []
    }
    let count = CFArrayGetCount(windows)
    var wins: [(element: AXUIElement, x: CGFloat, y: CGFloat)] = []
    for i in 0..<count {
        let win = unsafeBitCast(CFArrayGetValueAtIndex(windows, i), to: AXUIElement.self)
        var pos: CFTypeRef?
        AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &pos)
        var point = CGPoint.zero
        if let pos = pos {
            AXValueGetValue(pos as! AXValue, .cgPoint, &point)
        }
        wins.append((element: win, x: point.x, y: point.y))
    }
    wins.sort { ($0.y, $0.x) < ($1.y, $1.x) }
    return wins.map { $0.element }
}

// ─── Rebuild ref map from live tree ───────────────────────────────────────

/// Re-traverse the app tree to rebuild ref→AXUIElement for a given snapshotId.
/// This ensures we hold live element references for press/set-value.
/// MUST mirror cmdSnapshot's traversal exactly to get matching refs.
func rebuildRefMap(pid: pid_t, maxDepth: Int = 8, maxElements: Int = 500, hintMode: HintMode = .full) -> SnapshotContext {
    let appElement = AXUIElementCreateApplication(pid)
    let ctx = SnapshotContext(maxElements: maxElements)

    // Walk children of each window (NOT the window itself) — must match cmdSnapshot
    let sortedWindows = getSortedWindows(appElement)
    if !sortedWindows.isEmpty {
        for win in sortedWindows {
            guard !ctx.isFull else { break }
            let kids = getChildren(win)
            for kid in kids {
                guard !ctx.isFull else { break }
                _ = traverse(kid, depth: 0, maxDepth: maxDepth, ctx: ctx, hintMode: hintMode)
            }
        }
    } else {
        // Fallback: try children directly
        _ = traverse(appElement, depth: 0, maxDepth: maxDepth, ctx: ctx, hintMode: hintMode)
    }

    return ctx
}

// ─── UUID generation ───────────────────────────────────────────────────────

func makeUUID() -> String {
    return UUID().uuidString.lowercased()
}

// ─── COMMAND: list-apps ────────────────────────────────────────────────────

func cmdListApps() {
    let apps = NSWorkspace.shared.runningApplications
        .filter { $0.activationPolicy == .regular }
        .compactMap { $0.localizedName }
        .sorted()
    outputJSON(apps)
}

// ─── COMMAND: snapshot ────────────────────────────────────────────────────

func cmdSnapshot(appName: String?, maxDepth: Int, maxElements: Int, hintMode: HintMode = .full) {
    guard let (pid, displayName) = resolveApp(named: appName) else {
        if let name = appName {
            exitWithError("App '\(name)' not found or not running")
        } else {
            exitWithError("No frontmost app found")
        }
    }

    let appElement = AXUIElementCreateApplication(pid)
    let ctx = SnapshotContext(maxElements: maxElements)

    var windowTitle: String = ""
    var rootElements: [AXElement] = []

    // Get windows (sorted by title for stable ref numbering)
    let sortedWindows = getSortedWindows(appElement)
    if !sortedWindows.isEmpty {
        if let wTitle = getStringAttribute(sortedWindows[0], kAXTitleAttribute) {
            windowTitle = wTitle
        }
        for win in sortedWindows {
            guard !ctx.isFull else { break }
            let kids = getChildren(win)
            for kid in kids {
                guard !ctx.isFull else { break }
                if let el = traverse(kid, depth: 0, maxDepth: maxDepth, ctx: ctx, hintMode: hintMode) {
                    rootElements.append(el)
                }
            }
        }
    }

    let snapshotId = makeUUID()

    // Persist snapshot metadata
    let meta = SnapshotMeta(snapshotId: snapshotId, pid: pid, appName: displayName, hintMode: hintMode.rawValue)
    saveSnapshotMeta(meta)

    // Output snapshot — tree structure with children nested
    let elementsJson: [[String: Any]]
    switch hintMode {
    case .leafCompact:
        elementsJson = rootElements.compactMap { elementToDictLeafCompact($0) }
    default:
        elementsJson = rootElements.map { elementToDict($0, mode: hintMode) }
    }
    outputJSON(["snapshotId": snapshotId, "app": displayName, "window": windowTitle, "elements": elementsJson])
}

// ─── COMMAND: press ───────────────────────────────────────────────────────

enum PressMethod: String {
    case auto      // try AXPress, fall back to CGEvent (default)
    case axPress   = "AXPress"
    case cgEvent   = "CGEvent"
}

func cmdPress(ref: Int, snapshotId: String, method: PressMethod = .auto, doubleClick: Bool = false) {
    guard let meta = loadSnapshotMeta(snapshotId: snapshotId) else {
        exitWithError("Snapshot '\(snapshotId)' not found — run snapshot first")
    }

    let mode = HintMode(rawValue: meta.hintMode) ?? .full
    let ctx = rebuildRefMap(pid: pid_t(meta.pid), hintMode: mode)

    guard let element = ctx.refMap[ref] else {
        exitWithError("Ref \(ref) not found in app tree (app: \(meta.appName))")
    }

    let actions = getActions(element)

    // ── AXPress path ──────────────────────────────────────────────────────
    let wantAX = method == .auto || method == .axPress
    if wantAX && actions.contains("AXPress") {
        let result = AXUIElementPerformAction(element, "AXPress" as CFString)
        if result == .success {
            outputJSON(["status": "pressed", "ref": ref, "method": "AXPress"])
            return
        }
        // Explicit --method AXPress: fail hard instead of silently falling back
        if method == .axPress {
            exitWithError("AXPress failed on ref \(ref) (code \(result.rawValue))")
        }
        // auto: AXPress failed — fall through to CGEvent
    } else if method == .axPress {
        exitWithError("Ref \(ref) has no AXPress action (available: \(actions.joined(separator: ", ")))")
    }

    // ── CGEvent click path ────────────────────────────────────────────────
    guard let pos = getPosition(element), let size = getSize(element) else {
        exitWithError("Cannot CGEvent-click ref \(ref): no position/size available")
    }

    // Verify the element's center is inside the app window.
    // If it is outside, the click will be ignored by the OS. This happens when
    // an element is partially or fully scrolled off-screen (e.g. a card whose
    // bottom half is below the window edge, or a row above the scroll viewport).
    // In that case, return a clear error so the caller can scroll the element
    // into view before retrying.
    let elemRect = CGRect(origin: pos, size: size)
    let center = CGPoint(x: elemRect.midX, y: elemRect.midY)
    let appElement = AXUIElementCreateApplication(pid_t(meta.pid))
    let windows = getSortedWindows(appElement)
    if let win = windows.first,
       let winPos = getPosition(win),
       let winSize = getSize(win) {
        // Expand by 50px to handle AX position lag after scrolling
        // (some apps e.g. Music report layout positions that don't update
        //  synchronously after a scroll, so the element center may appear
        //  slightly outside the window rect even though it's visually in view).
        let margin: CGFloat = 50
        let winRect = CGRect(origin: winPos, size: winSize).insetBy(dx: -margin, dy: -margin)
        if !winRect.contains(center) {
            exitWithError(
                "Ref \(ref) center (\(Int(center.x)),\(Int(center.y))) is outside the window " +
                "(\(Int(winPos.x)),\(Int(winPos.y)) \(Int(winSize.width))×\(Int(winSize.height))). " +
                "Scroll the element into view first, then retry."
            )
        }
    }

    let point = center
    let src = CGEventSource(stateID: .hidSystemState)

    func postClick(clickCount: Int32) {
        guard
            let mouseDown = CGEvent(mouseEventSource: src, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
            let mouseUp   = CGEvent(mouseEventSource: src, mouseType: .leftMouseUp,   mouseCursorPosition: point, mouseButton: .left)
        else { return }
        mouseDown.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
        mouseUp.setIntegerValueField(.mouseEventClickState, value: Int64(clickCount))
        mouseDown.post(tap: .cghidEventTap)
        usleep(30_000) // 30ms between down and up
        mouseUp.post(tap: .cghidEventTap)
    }

    if doubleClick {
        postClick(clickCount: 1)
        usleep(80_000) // 80ms between clicks (within double-click threshold)
        postClick(clickCount: 2)
        outputJSON(["status": "double-clicked", "ref": ref, "method": "CGEvent",
                    "x": Int(point.x), "y": Int(point.y)])
    } else {
        postClick(clickCount: 1)
        outputJSON(["status": "clicked", "ref": ref, "method": "CGEvent",
                    "x": Int(point.x), "y": Int(point.y)])
    }
}

// ─── COMMAND: set-value ───────────────────────────────────────────────────

func cmdSetValue(ref: Int, snapshotId: String, value: String) {
    guard let meta = loadSnapshotMeta(snapshotId: snapshotId) else {
        exitWithError("Snapshot '\(snapshotId)' not found — run snapshot first")
    }

    let mode = HintMode(rawValue: meta.hintMode) ?? .full
    let ctx = rebuildRefMap(pid: pid_t(meta.pid), hintMode: mode)

    guard let element = ctx.refMap[ref] else {
        exitWithError("Ref \(ref) not found in app tree (app: \(meta.appName))")
    }

    // Attempt AXValue set (skip for AXWebArea — reports success but doesn't actually set)
    let role: String = getStringAttribute(element, kAXRoleAttribute) ?? ""
    if role != "AXWebArea" {
        let setResult = AXUIElementSetAttributeValue(element, kAXValueAttribute as CFString, value as CFString)
        if setResult == .success {
            outputJSON(["status": "set", "ref": ref, "value": value])
            return
        }
    }

    // Fallback: focus the element so the caller can type
    let focusResult = AXUIElementSetAttributeValue(element, kAXFocusedAttribute as CFString, true as CFBoolean)
    if focusResult == .success {
        outputJSON([
            "status": "focused",
            "ref": ref,
            "note": "Element focused — use type action to insert text",
        ])
    } else {
        exitWithError("set-value failed on ref \(ref): focus error \(focusResult.rawValue)")
    }
}

// ─── COMMAND: window-id ───────────────────────────────────────────────────

func cmdWindowId(appName: String?) {
    guard let (pid, displayName) = resolveApp(named: appName) else {
        if let name = appName {
            exitWithError("App '\(name)' not found or not running")
        } else {
            exitWithError("No frontmost app found")
        }
    }

    // Get windows from CGWindowListCopyWindowInfo
    guard let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[CFString: Any]] else {
        exitWithError("Failed to get window list")
    }

    // Find the first on-screen window for this PID
    for window in windowList {
        guard let ownerPID = window[kCGWindowOwnerPID] as? Int32,
              ownerPID == pid,
              let windowID = window[kCGWindowNumber] as? Int,
              let layer = window[kCGWindowLayer] as? Int,
              layer == 0 else { continue }  // layer 0 = normal windows

        let windowName = window[kCGWindowName as CFString] as? String ?? ""
        let bounds = window[kCGWindowBounds as CFString] as? [String: Any]
        let boundsX = bounds?["X"] as? Double ?? 0
        let boundsY = bounds?["Y"] as? Double ?? 0
        let boundsW = bounds?["Width"] as? Double ?? 0
        let boundsH = bounds?["Height"] as? Double ?? 0
        outputJSON(["windowId": windowID, "app": displayName, "window": windowName, "pid": Int(pid),
                    "bounds": ["x": boundsX, "y": boundsY, "width": boundsW, "height": boundsH]])
        return
    }

    exitWithError("No on-screen window found for '\(displayName)'")
}

// ─── COMMAND: annotate ─────────────────────────────────────────────────────

/// Element hint descriptor for rendering badges.
struct HintElement {
    let ref: Int
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

func parseHintsFromStdin() -> [HintElement] {
    guard let data = FileHandle.standardInput.readDataToEndOfFile() as Data?,
          let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
        return []
    }
    return arr.compactMap { dict in
        guard let ref = dict["ref"] as? Int,
              let x = dict["x"] as? Double,
              let y = dict["y"] as? Double,
              let w = dict["w"] as? Double,
              let h = dict["h"] as? Double else { return nil }
        return HintElement(ref: ref, x: x, y: y, w: w, h: h)
    }
}

/// Render red ref-number badges onto an image at the given positions.
func renderBadges(inputPath: String, outputPath: String, hints: [HintElement], scale: Double) {
    // Load the input PNG
    guard let inputURL = CFURLCreateWithFileSystemPath(nil, inputPath as CFString, .cfurlposixPathStyle, false),
          let source = CGImageSourceCreateWithURL(inputURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        exitWithError("Failed to load image from \(inputPath)")
    }

    let imgWidth = image.width
    let imgHeight = image.height

    // Create a bitmap context at image dimensions
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(
        data: nil,
        width: imgWidth,
        height: imgHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        exitWithError("Failed to create bitmap context")
    }

    // Draw original image (Core Graphics has origin at bottom-left)
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: imgWidth, height: imgHeight))

    // Flip coordinate system so we work in top-left origin (matching screen coords)
    ctx.translateBy(x: 0, y: CGFloat(imgHeight))
    ctx.scaleBy(x: 1, y: -1)

    // Styling
    let badgeBgColor = CGColor(red: 0.898, green: 0.224, blue: 0.208, alpha: 0.90) // #E53935
    let badgeTextColor = CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
    let borderColor = CGColor(red: 0.898, green: 0.224, blue: 0.208, alpha: 0.60) // same red, lighter
    let fontSize: CGFloat = 11.0
    let cornerRadius: CGFloat = 3.0
    let hPad: CGFloat = 4.0
    let vPad: CGFloat = 2.0
    let borderWidth: CGFloat = 1.5

    // Use system bold font via Core Text
    let font = CTFontCreateWithName("Helvetica-Bold" as CFString, fontSize, nil)

    for hint in hints {
        // Convert screen-point coords to image-pixel coords
        let imgX = hint.x * scale
        let imgY = hint.y * scale
        let imgW = hint.w * scale
        let imgH = hint.h * scale

        // Draw bounding box around the element
        let elementRect = CGRect(x: CGFloat(imgX), y: CGFloat(imgY), width: CGFloat(imgW), height: CGFloat(imgH))
        ctx.setStrokeColor(borderColor)
        ctx.setLineWidth(borderWidth)
        ctx.stroke(elementRect)

        // Render ref number text
        let text = "\(hint.ref)"
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: badgeTextColor,
        ]
        let attrStr = NSAttributedString(string: text, attributes: attrs)
        let line = CTLineCreateWithAttributedString(attrStr)
        let textBounds = CTLineGetBoundsWithOptions(line, .useOpticalBounds)

        // Badge dimensions
        let badgeW = textBounds.width + hPad * 2
        let badgeH = textBounds.height + vPad * 2

        // Position badge at top-left corner of the bounding box
        let badgeX = CGFloat(imgX)
        let badgeY = max(0, CGFloat(imgY) - badgeH)

        // Draw rounded rect background
        let badgeRect = CGRect(x: badgeX, y: badgeY, width: badgeW, height: badgeH)
        let path = CGPath(roundedRect: badgeRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
        ctx.setFillColor(badgeBgColor)
        ctx.addPath(path)
        ctx.fillPath()

        // Draw text
        ctx.saveGState()
        let textX = badgeX + hPad - textBounds.origin.x
        // Flip again locally for text rendering since CTLineDraw expects unflipped
        ctx.translateBy(x: 0, y: badgeY * 2 + badgeH)
        ctx.scaleBy(x: 1, y: -1)
        ctx.textPosition = CGPoint(x: textX, y: badgeY + vPad - textBounds.origin.y)
        CTLineDraw(line, ctx)
        ctx.restoreGState()
    }

    // Write output PNG
    guard let outputImage = ctx.makeImage(),
          let outputURL = CFURLCreateWithFileSystemPath(nil, outputPath as CFString, .cfurlposixPathStyle, false),
          let dest = CGImageDestinationCreateWithURL(outputURL, "public.png" as CFString, 1, nil) else {
        exitWithError("Failed to create output image at \(outputPath)")
    }
    CGImageDestinationAddImage(dest, outputImage, nil)
    guard CGImageDestinationFinalize(dest) else {
        exitWithError("Failed to write output PNG to \(outputPath)")
    }
}

func cmdAnnotate(inputPath: String, outputPath: String, scale: Double) {
    let hints = parseHintsFromStdin()
    renderBadges(inputPath: inputPath, outputPath: outputPath, hints: hints, scale: scale)
    outputJSON(["status": "ok", "hints": hints.count, "output": outputPath])
}

// ─── COMMAND: annotated-screenshot ────────────────────────────────────────

/// Returns true if any descendant of `el` has non-empty actions.
func hasActionableDescendant(_ el: [String: Any]) -> Bool {
    guard let children = el["children"] as? [[String: Any]] else { return false }
    for child in children {
        if let actions = child["actions"] as? [String], !actions.isEmpty { return true }
        if hasActionableDescendant(child) { return true }
    }
    return false
}

/// Collect positioned interactive elements from an AXElement tree as HintElements.
/// Only "leaf actionable" elements are included — those with actions but no actionable descendants.
/// This avoids parent containers (groups, scroll areas) overlapping their children.
func collectHints(_ elements: [[String: Any]]) -> [HintElement] {
    var result: [HintElement] = []
    func walk(_ el: [String: Any]) {
        let actions = (el["actions"] as? [String]) ?? []
        let isActionable = !actions.isEmpty
        let children = el["children"] as? [[String: Any]]

        // If this element is actionable and has no actionable descendants → leaf hint
        if isActionable, let ref = el["ref"] as? Int, !hasActionableDescendant(el) {
            var x: Double = 0, y: Double = 0, w: Double = 0, h: Double = 0
            var hasPos = false, hasSize = false

            if let pos = el["pos"] as? [NSNumber], pos.count == 2 {
                x = pos[0].doubleValue; y = pos[1].doubleValue; hasPos = true
            }
            if let size = el["size"] as? [NSNumber], size.count == 2 {
                w = size[0].doubleValue; h = size[1].doubleValue; hasSize = true
            }

            if hasPos && hasSize {
                result.append(HintElement(ref: ref, x: x, y: y, w: w, h: h))
            }
            // No need to recurse — children have no actions
            return
        }

        // Recurse into children
        if let children = children {
            for child in children { walk(child) }
        }
    }
    for el in elements { walk(el) }
    return result
}

func cmdAnnotatedScreenshot(appName: String?, outputPath: String, maxDepth: Int, maxElements: Int) {
    // 1. Resolve app
    guard let (pid, displayName) = resolveApp(named: appName) else {
        if let name = appName {
            exitWithError("App '\(name)' not found or not running")
        } else {
            exitWithError("No frontmost app found")
        }
    }

    // 2. Take AX snapshot
    let appElement = AXUIElementCreateApplication(pid)
    let ctx = SnapshotContext(maxElements: maxElements)
    var windowTitle: String = ""
    var rootElements: [AXElement] = []

    if let windows = getAttribute(appElement, kAXWindowsAttribute) as CFArray? {
        let count = CFArrayGetCount(windows)
        for i in 0..<count {
            guard !ctx.isFull else { break }
            let win = unsafeBitCast(CFArrayGetValueAtIndex(windows, i), to: AXUIElement.self)
            if i == 0, let wTitle = getStringAttribute(win, kAXTitleAttribute) {
                windowTitle = wTitle
            }
            let kids = getChildren(win)
            for kid in kids {
                guard !ctx.isFull else { break }
                if let el = traverse(kid, depth: 0, maxDepth: maxDepth, ctx: ctx) {
                    rootElements.append(el)
                }
            }
        }
    }

    let elementsJson = rootElements.map { elementToDict($0) }

    // 3. Find window ID for screencapture
    var windowId: Int? = nil
    if let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[CFString: Any]] {
        for window in windowList {
            guard let ownerPID = window[kCGWindowOwnerPID] as? Int32,
                  ownerPID == pid,
                  let wid = window[kCGWindowNumber] as? Int,
                  let layer = window[kCGWindowLayer] as? Int,
                  layer == 0 else { continue }
            windowId = wid
            break
        }
    }

    // 4. Capture screenshot
    let tmpScreenshot = "\(computerDir)/ax-screenshot-\(ProcessInfo.processInfo.globallyUniqueString).png"
    let captureArgs: [String]
    if let wid = windowId {
        captureArgs = ["-x", "-o", "-l", String(wid), tmpScreenshot]
    } else {
        captureArgs = ["-x", "-C", tmpScreenshot]
    }

    let captureProcess = Process()
    captureProcess.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    captureProcess.arguments = captureArgs
    do {
        try captureProcess.run()
        captureProcess.waitUntilExit()
    } catch {
        exitWithError("screencapture failed: \(error)")
    }
    guard captureProcess.terminationStatus == 0 else {
        exitWithError("screencapture exited with code \(captureProcess.terminationStatus)")
    }

    // 5. Detect retina scale from captured image
    guard let screenshotURL = CFURLCreateWithFileSystemPath(nil, tmpScreenshot as CFString, .cfurlposixPathStyle, false),
          let source = CGImageSourceCreateWithURL(screenshotURL, nil),
          let screenshotImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        exitWithError("Failed to load captured screenshot")
    }
    let capturedWidth = screenshotImage.width
    // Retina: captured pixels / screen points. Use main screen backing scale.
    let retinaScale: Double
    if let mainScreen = NSScreen.main {
        retinaScale = Double(mainScreen.backingScaleFactor)
    } else {
        retinaScale = 2.0
    }

    // 6. Collect hints from the AX tree
    let hints = collectHints(elementsJson)

    // 7. Render badges — for window capture, AX positions are absolute screen coords
    //    but the captured image starts at the window origin. We need to offset.
    var windowOriginX: Double = 0
    var windowOriginY: Double = 0
    if let wid = windowId,
       let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[CFString: Any]] {
        for window in windowList {
            guard let thisWid = window[kCGWindowNumber] as? Int, thisWid == wid,
                  let bounds = window[kCGWindowBounds as CFString] as? [String: Double] else { continue }
            windowOriginX = bounds["X"] ?? 0
            windowOriginY = bounds["Y"] ?? 0
            break
        }
    }

    let adjustedHints = hints.map { hint in
        HintElement(
            ref: hint.ref,
            x: hint.x - windowOriginX,
            y: hint.y - windowOriginY,
            w: hint.w,
            h: hint.h
        )
    }

    renderBadges(inputPath: tmpScreenshot, outputPath: outputPath, hints: adjustedHints, scale: retinaScale)

    // 8. Cleanup
    try? FileManager.default.removeItem(atPath: tmpScreenshot)

    // 9. Output snapshot JSON + annotation info
    var output: [String: Any] = [
        "app": displayName,
        "window": windowTitle,
        "elements": elementsJson,
        "hints": hints.count,
        "output": outputPath,
        "capturedWidth": capturedWidth,
    ]
    if let wid = windowId { output["windowId"] = wid }
    outputJSON(output)
}

// ─── COMMAND: scroll ──────────────────────────────────────────────────────

/// Scroll in two modes:
///
/// 1. **Ref mode** (`--ref + --snapshot-id`):
///    Performs `AXScrollToVisible` on the element so its scroll container
///    brings it into view. Use this before pressing an element whose center
///    is outside the window. Falls back to scrolling the nearest scroll-area
///    ancestor by the element's overflow amount if AXScrollToVisible is
///    unavailable.
///
/// 2. **Point mode** (`--x --y`):
///    Posts a CGEvent scroll-wheel event at the given screen point.
///    `--dx` / `--dy` control the scroll delta in lines (default 3).
///    Positive dy = scroll down, negative dy = scroll up (matches natural
///    scrolling direction). dx works the same for horizontal.

func cmdScroll(
    ref: Int?, snapshotId: String?,
    x: Int?, y: Int?,
    dx: Int, dy: Int,
    appName: String? = nil
) {
    // ── Ref mode: AXScrollToVisible → AXScrollBar ─────────────────────────
    if let ref = ref, let snapshotId = snapshotId {
        guard let meta = loadSnapshotMeta(snapshotId: snapshotId) else {
            exitWithError("Snapshot '\(snapshotId)' not found — run snapshot first")
        }
        let mode = HintMode(rawValue: meta.hintMode) ?? .full
        let ctx = rebuildRefMap(pid: pid_t(meta.pid), hintMode: mode)
        guard let element = ctx.refMap[ref] else {
            exitWithError("Ref \(ref) not found in app tree (app: \(meta.appName))")
        }

        // 1. Try AXScrollToVisible — no focus needed
        let actions = getActions(element)
        if actions.contains("AXScrollToVisible") {
            let result = AXUIElementPerformAction(element, "AXScrollToVisible" as CFString)
            if result == .success {
                outputJSON(["status": "scrolled", "ref": ref, "method": "AXScrollToVisible"])
                return
            }
        }

        // 2. Fallback: CGEvent scroll wheel at the element's center, with
        //    app activation so the event is delivered to the right window.
        guard let pos = getPosition(element), let size = getSize(element) else {
            exitWithError("Ref \(ref) has no position — cannot scroll")
        }

        // Find the viewport scroll area to scroll at its center (more reliable
        // than scrolling at the element center which may be off-screen)
        func findViewportScrollArea(_ el: AXUIElement, elemHeight: CGFloat, limit: Int = 10) -> AXUIElement? {
            var current: AXUIElement? = el
            var steps = 0
            while let c = current, steps < limit {
                let role: String = getStringAttribute(c, kAXRoleAttribute) ?? ""
                if role == "AXScrollArea", let sz = getSize(c), sz.height > elemHeight * 1.5 { return c }
                var parent: CFTypeRef?
                guard AXUIElementCopyAttributeValue(c, kAXParentAttribute as CFString, &parent) == .success,
                      let p = parent else { break }
                current = (p as! AXUIElement); steps += 1
            }
            return nil
        }

        // Determine scroll direction and magnitude
        let elemCenterY = pos.y + size.height / 2
        var scrollLines = 5  // default: scroll 5 lines

        var scrollX = pos.x + size.width / 2
        var scrollY = pos.y + size.height / 2

        if let sa = findViewportScrollArea(element, elemHeight: size.height),
           let saPos = getPosition(sa), let saSize = getSize(sa) {
            // Scroll at the scroll area center
            scrollX = saPos.x + saSize.width / 2
            scrollY = saPos.y + saSize.height / 2
            // Scale lines to the overflow
            let saBottom = saPos.y + saSize.height
            if elemCenterY > saBottom {
                let overflow = elemCenterY - saBottom
                scrollLines = max(3, Int(overflow / 20))
            } else if elemCenterY < saPos.y {
                let overflow = saPos.y - elemCenterY
                scrollLines = -max(3, Int(overflow / 20))
            }
        }

        // Activate the target app, scroll, restore
        let previousApp = NSWorkspace.shared.frontmostApplication
        if let targetApp = NSRunningApplication(processIdentifier: pid_t(meta.pid)) {
            targetApp.activate(options: .activateIgnoringOtherApps)
            usleep(150_000)
        }

        guard let scrollEv = CGEvent(
            scrollWheelEvent2Source: nil,
            units: .line, wheelCount: 1,
            wheel1: Int32(-scrollLines), wheel2: 0, wheel3: 0
        ) else {
            exitWithError("Failed to create CGEvent scroll for ref \(ref)")
        }
        scrollEv.location = CGPoint(x: scrollX, y: scrollY)
        scrollEv.post(tap: .cghidEventTap)

        usleep(50_000)
        previousApp?.activate(options: .activateIgnoringOtherApps)

        outputJSON(["status": "scrolled", "ref": ref, "method": "CGEvent",
                    "x": Int(scrollX), "y": Int(scrollY), "lines": scrollLines])
        return
    }

    // ── Point mode: CGEvent scroll wheel ─────────────────────────────────
    // CGEvent scroll goes to the frontmost app. Temporarily activate the
    // target app (from --snapshot-id, --app, or by hit-testing the point),
    // post the scroll, then restore the previously frontmost app.
    guard let px = x, let py = y else {
        exitWithError("scroll requires either (--ref + --snapshot-id) or (--x + --y)")
    }

    let previousApp = NSWorkspace.shared.frontmostApplication

    // Determine which app to activate
    var targetPid: pid_t? = nil

    // Priority 1: Use snapshot metadata if snapshot-id provided
    if let snapshotId = snapshotId, let meta = loadSnapshotMeta(snapshotId: snapshotId) {
        targetPid = pid_t(meta.pid)
    }
    // Priority 2: Use --app parameter
    else if let appName = appName {
        if let app = NSWorkspace.shared.runningApplications.first(where: {
            $0.localizedName?.caseInsensitiveCompare(appName) == .orderedSame
        }) {
            targetPid = app.processIdentifier
        }
    }
    // Priority 3: Hit-test the point to find the app
    else {
        var hitEl: AXUIElement?
        var pid: pid_t = 0
        let systemWide = AXUIElementCreateSystemWide()
        if AXUIElementCopyElementAtPosition(systemWide, Float(px), Float(py), &hitEl) == .success,
           let hit = hitEl {
            AXUIElementGetPid(hit, &pid)
            targetPid = pid
        }
    }

    // Activate the target app
    if let pid = targetPid, let app = NSRunningApplication(processIdentifier: pid) {
        app.activate(options: .activateIgnoringOtherApps)
        usleep(150_000) // 150ms for activation
    }

    guard let scrollEvent = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .line, wheelCount: 2,
        wheel1: Int32(-dy), wheel2: Int32(-dx), wheel3: 0
    ) else {
        exitWithError("Failed to create CGEvent scroll event")
    }
    scrollEvent.location = CGPoint(x: px, y: py)
    scrollEvent.post(tap: .cghidEventTap)

    // Restore previous frontmost app
    usleep(50_000)
    previousApp?.activate(options: .activateIgnoringOtherApps)

    outputJSON(["status": "scrolled", "method": "CGEvent", "x": px, "y": py, "dx": dx, "dy": dy])
}


func parseArgs() {
    var args = CommandLine.arguments.dropFirst() // drop binary name
    guard let command = args.first else {
        print("""
        USAGE:
          ax-helper snapshot [--app <name>] [--max-depth <n>] [--max-elements <n>] [--hint-mode <full|leafOnly|leafCompact>]
          ax-helper press --ref <id> --snapshot-id <uuid> [--method AXPress|CGEvent|auto] [--double]
          ax-helper set-value --ref <id> --snapshot-id <uuid> --value <text>
          ax-helper scroll --ref <id> --snapshot-id <uuid>
          ax-helper scroll --x <n> --y <n> [--dx <n>] [--dy <n>]
          ax-helper list-apps
          ax-helper annotated-screenshot [--app <name>] [--output <path>]
          ax-helper window-id [--app <name>]
        """)
        exit(0)
    }
    args = args.dropFirst()

    switch command {

    case "list-apps":
        cmdListApps()

    case "snapshot":
        var appName: String? = nil
        var maxDepth = 8
        var maxElements = 500
        var hintMode: HintMode = .full

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--app":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--app requires a value") }
                appName = args[i]
            case "--max-depth":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--max-depth requires an integer") }
                maxDepth = n
            case "--max-elements":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--max-elements requires an integer") }
                maxElements = n
            case "--hint-mode":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--hint-mode requires a value (full, leaf-only, leaf-compact)") }
                guard let mode = HintMode(rawValue: args[i]) else {
                    exitWithError("Unknown hint-mode '\(args[i])'. Use: full, leafOnly, leafCompact")
                }
                hintMode = mode
            default:
                exitWithError("Unknown flag '\(flag)' for snapshot")
            }
            i = args.index(after: i)
        }

        cmdSnapshot(appName: appName, maxDepth: maxDepth, maxElements: maxElements, hintMode: hintMode)

    case "press":
        var ref: Int? = nil
        var snapshotId: String? = nil
        var pressMethod: PressMethod = .auto
        var doubleClick: Bool = false

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--ref":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--ref requires an integer") }
                ref = n
            case "--snapshot-id":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--snapshot-id requires a value") }
                snapshotId = args[i]
            case "--method":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--method requires a value (AXPress, CGEvent, auto)") }
                switch args[i] {
                case "AXPress": pressMethod = .axPress
                case "CGEvent": pressMethod = .cgEvent
                case "auto":    pressMethod = .auto
                default: exitWithError("Unknown --method '\(args[i])'. Use: AXPress, CGEvent, auto")
                }
            case "--double":
                doubleClick = true
            default:
                exitWithError("Unknown flag '\(flag)' for press")
            }
            i = args.index(after: i)
        }

        guard let r = ref else { exitWithError("press requires --ref") }
        guard let sid = snapshotId else { exitWithError("press requires --snapshot-id") }
        cmdPress(ref: r, snapshotId: sid, method: pressMethod, doubleClick: doubleClick)

    case "set-value":
        var ref: Int? = nil
        var snapshotId: String? = nil
        var value: String? = nil

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--ref":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--ref requires an integer") }
                ref = n
            case "--snapshot-id":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--snapshot-id requires a value") }
                snapshotId = args[i]
            case "--value":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--value requires a value") }
                value = args[i]
            default:
                exitWithError("Unknown flag '\(flag)' for set-value")
            }
            i = args.index(after: i)
        }

        guard let r = ref else { exitWithError("set-value requires --ref") }
        guard let sid = snapshotId else { exitWithError("set-value requires --snapshot-id") }
        guard let v = value else { exitWithError("set-value requires --value") }
        cmdSetValue(ref: r, snapshotId: sid, value: v)

    case "annotate":
        var inputPath: String? = nil
        var outputPath: String? = nil
        var scale: Double = 1.0

        var i = args.startIndex
        var positionalIndex = 0
        while i < args.endIndex {
            let arg = args[i]
            if arg == "--scale" {
                i = args.index(after: i)
                guard i < args.endIndex, let s = Double(args[i]) else { exitWithError("--scale requires a number") }
                scale = s
            } else if !arg.hasPrefix("-") {
                if positionalIndex == 0 {
                    inputPath = arg
                } else if positionalIndex == 1 {
                    outputPath = arg
                }
                positionalIndex += 1
            } else {
                exitWithError("Unknown flag '\(arg)' for annotate")
            }
            i = args.index(after: i)
        }

        guard let inp = inputPath else { exitWithError("annotate requires <input-png>") }
        guard let out = outputPath else { exitWithError("annotate requires <output-png>") }
        cmdAnnotate(inputPath: inp, outputPath: out, scale: scale)

    case "annotated-screenshot":
        var appName: String? = nil
        var outputPath: String = NSHomeDirectory() + "/.nuvin/computer/annotated.png"
        var maxDepth = 8
        var maxElements = 500

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--app":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--app requires a value") }
                appName = args[i]
            case "--output", "-o":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--output requires a value") }
                outputPath = args[i]
            case "--max-depth":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--max-depth requires an integer") }
                maxDepth = n
            case "--max-elements":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--max-elements requires an integer") }
                maxElements = n
            default:
                exitWithError("Unknown flag '\(flag)' for annotated-screenshot")
            }
            i = args.index(after: i)
        }

        cmdAnnotatedScreenshot(appName: appName, outputPath: outputPath, maxDepth: maxDepth, maxElements: maxElements)

    case "window-id":
        var appName: String? = nil

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--app":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--app requires a value") }
                appName = args[i]
            default:
                exitWithError("Unknown flag '\(flag)' for window-id")
            }
            i = args.index(after: i)
        }

        cmdWindowId(appName: appName)

    case "scroll":
        var ref: Int? = nil
        var snapshotId: String? = nil
        var x: Int? = nil
        var y: Int? = nil
        var dx: Int = 0
        var dy: Int = 3  // default: 3 lines down
        var appName: String? = nil

        var i = args.startIndex
        while i < args.endIndex {
            let flag = args[i]
            switch flag {
            case "--ref":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--ref requires an integer") }
                ref = n
            case "--snapshot-id":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--snapshot-id requires a value") }
                snapshotId = args[i]
            case "--x":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--x requires an integer") }
                x = n
            case "--y":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--y requires an integer") }
                y = n
            case "--dx":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--dx requires an integer") }
                dx = n
            case "--dy":
                i = args.index(after: i)
                guard i < args.endIndex, let n = Int(args[i]) else { exitWithError("--dy requires an integer") }
                dy = n
            case "--app":
                i = args.index(after: i)
                guard i < args.endIndex else { exitWithError("--app requires a value") }
                appName = args[i]
            default:
                exitWithError("Unknown flag '\(flag)' for scroll")
            }
            i = args.index(after: i)
        }

        cmdScroll(ref: ref, snapshotId: snapshotId, x: x, y: y, dx: dx, dy: dy, appName: appName)

    default:
        exitWithError("Unknown command '\(command)'. Use: snapshot, press, set-value, scroll, list-apps, annotated-screenshot, window-id")
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────

parseArgs()
