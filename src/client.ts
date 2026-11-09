import css from './layout.css'
import { findFrame, findPart, findParts, hasPart, modulePeers, type FrameParts } from './adapter'

interface Layout { toggleSidebar(): void }
interface Context { layout: Layout; effect(install: () => (() => void), label?: string): unknown }
export const name = 'dsh-flex-layout'
export const inject = ['layout']

/** Install as one disposable effect, including every listener and DOM marker. */
export function apply(ctx: Context): void {
  ctx.effect(() => install(document, ctx.layout), 'dsh-flex-layout: responsive layout')
}

export function install(doc: Document, layout: Layout): () => void {
  const win = doc.defaultView!
  const html = doc.documentElement
  const style = doc.createElement('style')
  style.dataset.dflOwned = ''
  style.textContent = css
  doc.head.append(style)
  // Snapshot only properties owned by this plugin, never replace style/class.
  const restore: (() => void)[] = []
  const marked = new Map<Element, Set<string>>()
  function attr(node: Element, key: string, value: string) {
    let keys = marked.get(node)
    if (!keys) marked.set(node, keys = new Set())
    if (!keys.has(key)) {
      const old = node.getAttribute(key)
      restore.push(() => old === null ? node.removeAttribute(key) : node.setAttribute(key, old))
      keys.add(key)
    }
    if (node.getAttribute(key) !== value) node.setAttribute(key, value)
  }
  const vars = ['--dfl-height', '--dfl-top']
  const oldVars = vars.map(key => [key, html.style.getPropertyValue(key), html.style.getPropertyPriority(key)])
  const cleanups: (() => void)[] = []
  const measuredCanvas = new Set<HTMLElement>()
  const measuredRegions = new Set<HTMLElement>()
  const statDocks = new Map<HTMLElement, HTMLButtonElement>()
  const statsExpanded = new WeakMap<HTMLElement, boolean>()
  let statsId = 0
  const ownedStyles = new Map<HTMLElement, Set<string>>()
  function cssVar(node: HTMLElement, key: string, value: string) {
    let keys = ownedStyles.get(node)
    if (!keys) ownedStyles.set(node, keys = new Set())
    if (!keys.has(key)) {
      const old = node.style.getPropertyValue(key), priority = node.style.getPropertyPriority(key)
      restore.push(() => old ? node.style.setProperty(key, old, priority) : node.style.removeProperty(key))
      keys.add(key)
    }
    if (node.style.getPropertyValue(key) !== value) node.style.setProperty(key, value)
  }
  let parts: FrameParts | undefined, raf = 0, disposed = false
  let legacy = false, drawerOpen = false, narrow = false, canvas = false
  let nativeToggle: HTMLElement | undefined, toggleIcon = ''
  let button: HTMLButtonElement | undefined, backdrop: HTMLButtonElement | undefined
  let previousFocus: HTMLElement | null = null
  const inertBefore = new Map<HTMLElement, boolean>()
  function inert(node: HTMLElement, value: boolean) {
    if (!inertBefore.has(node)) inertBefore.set(node, node.inert)
    node.inert = value || inertBefore.get(node)!
  }
  function releaseInert() {
    for (const [node, value] of inertBefore) node.inert = value
    inertBefore.clear()
  }
  function close() {
    if (parts && !parts.frame.hasAttribute('data-sidebar-collapsed')) layout.toggleSidebar()
  }
  function ownControls() {
    button = doc.createElement('button')
    button.type = 'button'
    // Same panel icon as the host. No React tree or new component library.
    button.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.5"/></svg>'
    button.dataset.dflToggle = ''; button.dataset.dflOwned = ''
    button.setAttribute('aria-label', '打开侧边栏 / Open sidebar')
    button.addEventListener('click', () => layout.toggleSidebar())
    backdrop = doc.createElement('button')
    backdrop.type = 'button'; backdrop.tabIndex = -1
    backdrop.dataset.dflBackdrop = ''; backdrop.dataset.dflOwned = ''
    backdrop.setAttribute('aria-label', '关闭侧栏 / Close sidebar')
    backdrop.addEventListener('click', close)
    parts!.frame.append(button, backdrop)
  }
  function role(node: HTMLElement | undefined, value: string) {
    if (node) attr(node, 'data-dfl', value)
  }
  function syncStats() {
    const docks = new Set(parts!.center.querySelectorAll<HTMLElement>('[data-composer-dock]'))
    for (const [dock, toggle] of statDocks) {
      if (!docks.has(dock) || !dock.querySelector('[data-composer-stat]')) {
        toggle.remove(); statDocks.delete(dock)
        dock.removeAttribute('data-dfl-stats-expanded')
        dock.removeAttribute('data-dfl-stats-has-context')
      }
    }
    for (const dock of docks) {
      const stats = [...dock.querySelectorAll<HTMLElement>('[data-composer-stat]')]
      if (!stats.length) continue
      const owner = dock.closest<HTMLElement>('[data-dfl="input-root"]') ?? dock
      for (const [index, stat] of stats.entries()) {
        attr(stat, 'data-dfl-stat-kind', stat.getAttribute('data-composer-stat') || (index ? 'usage' : 'activity'))
      }
      // Preserve every native detail handler. Only the layout disclosure is ours.
      const context = [...dock.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')]
        .find(node => !node.closest('[data-composer-stat]'))?.parentElement
      if (context) attr(context, 'data-dfl-stat-context', '')
      let toggle = statDocks.get(dock)
      if (!toggle) {
        toggle = doc.createElement('button')
        toggle.type = 'button'; toggle.dataset.dflStatsToggle = ''; toggle.dataset.dflOwned = ''
        toggle.className = stats[0].querySelector('button')?.className ?? ''
        toggle.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        if (!dock.id) attr(dock, 'id', `dfl-stats-${++statsId}`)
        toggle.setAttribute('aria-controls', dock.id)
        toggle.addEventListener('click', () => {
          const currentOwner = dock.closest<HTMLElement>('[data-dfl="input-root"]') ?? dock
          statsExpanded.set(currentOwner, !(statsExpanded.get(currentOwner) ?? false))
          schedule()
        })
        dock.append(toggle); statDocks.set(dock, toggle)
      }
      if (toggle.parentElement !== dock) dock.append(toggle)
      const expanded = statsExpanded.get(owner) ?? false
      attr(dock, 'data-dfl-stats-expanded', String(expanded))
      attr(dock, 'data-dfl-stats-has-context', String(!!context))
      toggle.setAttribute('aria-expanded', String(expanded))
      toggle.setAttribute('aria-label', expanded ? '收起详情 / Collapse details' : '展开详情 / Expand details')
      toggle.title = expanded ? '收起详情' : '展开详情'
    }
  }
  function discover() {
    const next = findFrame(doc)
    if (parts?.frame !== next?.frame) {
      if (parts) resize.unobserve(parts.frame)
      releaseInert(); button?.remove(); backdrop?.remove(); button = backdrop = undefined
      parts = next; drawerOpen = false; toggleIcon = ''
      if (parts) resize.observe(parts.frame)
    }
    if (!parts) return
    role(parts.frame, 'frame'); role(parts.sidebar, 'sidebar'); role(parts.center, 'center'); role(parts.rightbar, 'rightbar')
    // New hosts own their native drawer. Legacy hosts only get our fallback.
    legacy = !parts.frame.hasAttribute('data-sidebar-drawer') && !parts.frame.querySelector('[data-sidebar-mask]')
      && !parts.frame.querySelector('[class*="_drawerMask"]')
    // A native drawer marker disappears above its breakpoint. Remember capability.
    if (!legacy) attr(parts.frame, 'data-dfl-native-drawer', 'true')
    legacy = legacy && parts.frame.getAttribute('data-dfl-native-drawer') !== 'true'
    attr(parts.frame, 'data-dfl-legacy', String(legacy))
    if (legacy && !button) ownControls()
    if (!legacy) { button?.remove(); backdrop?.remove(); button = backdrop = undefined }
    canvas = [...parts.center.querySelectorAll<HTMLElement>('[data-canvas-conversation-view]')].some(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
    attr(parts.frame, 'data-dfl-canvas', String(canvas))
    const roots = [...parts.center.querySelectorAll<HTMLElement>('[data-canvas-conversation-view]')]
    const docks = roots.flatMap(root => [...root.querySelectorAll<HTMLElement>('.chat-dock')])
    const measured = new Set([...roots, ...docks])
    for (const node of measuredCanvas) if (!measured.has(node)) { resize.unobserve(node); measuredCanvas.delete(node) }
    for (const node of measured) if (!measuredCanvas.has(node)) { resize.observe(node); measuredCanvas.add(node) }
    for (const root of roots) {
      const bounds = root.getBoundingClientRect()
      const dock = root.querySelector<HTMLElement>('.chat-dock')
      cssVar(root, '--dfl-canvas-dock-height', `${Math.ceil(dock?.getBoundingClientRect().height ?? 0)}px`)
      cssVar(root, '--dfl-canvas-width', `${Math.round(bounds.width)}px`)
      cssVar(root, '--dfl-canvas-height', `${Math.round(bounds.height)}px`)
    }
    // Multiple embedded conversations can be mounted at once (including canvas).
    for (const scroll of findParts(parts.center, 'scrollBody')) {
      role(scroll, 'scroll')
      for (const node of modulePeers(scroll, 'scrollBody')) {
        for (const part of ['root', 'body', 'composerSeat', 'composerStack', 'titleRow', 'tabs', 'header', 'headerLeading', 'headerCorner', 'headerUtilities', 'titleCluster', 'viewTabs', 'viewsMoreAnchor', 'viewArea']) {
          if (hasPart(node, part)) role(node, `conversation-${part}`)
        }
      }
    }
    for (const controls of findParts(parts.center, 'standardControls')) {
      for (const node of modulePeers(controls, 'standardControls')) {
        for (const part of ['root', 'row', 'card', 'modes', 'tools', 'trailing', 'standardControls', 'input', 'scroll', 'grow', 'dock']) {
          if (hasPart(node, part)) role(node, `input-${part}`)
        }
      }
    }
    for (const stat of parts.center.querySelectorAll<HTMLElement>('[data-composer-stat]')) {
      role(findPart(stat, 'pill'), 'stat-pill')
      role(findPart(stat, 'label'), 'stat-label')
    }
    syncStats()
    // Navigation follows the frame; content and controls follow their own
    // available containers. A desktop canvas composer can still be only 430px.
    const regions = new Set<HTMLElement>()
    const visible = win.visualViewport
    const availableHeight = visible && Math.abs(visible.scale - 1) < 0.02 ? visible.height : win.innerHeight
    for (const body of parts.center.querySelectorAll<HTMLElement>('[data-dfl="conversation-body"]')) {
      const root = body.parentElement?.matches('[data-dfl="conversation-root"]') ? body.parentElement : undefined
      if (root) regions.add(root)
      regions.add(body)
      const bounds = body.getBoundingClientRect(), outer = (root ?? body).getBoundingClientRect()
      const width = Math.min(bounds.width, outer.width)
      const size = width < 320 ? 'micro' : width < 768 ? 'compact' : 'regular'
      if (root) {
        attr(root, 'data-dfl-conversation-size', size)
        attr(root, 'data-dfl-short', String(outer.height < 300))
      }
      attr(body, 'data-dfl-content-size', size)
      attr(body, 'data-dfl-content-short', String(outer.height < 300))
      attr(body, 'data-dfl-canvas-layout', width >= 1100 && outer.height >= 600 ? 'native' : width >= 600 && width > outer.height ? 'split' : 'stack')
      cssVar(body, '--dfl-content-width', `${Math.round(width)}px`)
      cssVar(body, '--dfl-content-height', `${Math.round(Math.min(outer.height, availableHeight))}px`)
    }
    for (const root of parts.center.querySelectorAll<HTMLElement>('[data-dfl="input-root"]')) {
      const seat = root.closest<HTMLElement>('[data-composer-seat], [data-dfl="conversation-composerSeat"]')
      const body = root.closest<HTMLElement>('[data-dfl="conversation-body"]')
      regions.add(root)
      if (seat) regions.add(seat)
      // Seat outer width is stable when compact padding changes. Measuring the
      // padded child here would make the 600px breakpoint history-dependent.
      const width = Math.min((seat ?? root).getBoundingClientRect().width, body?.getBoundingClientRect().width ?? Infinity)
      attr(root, 'data-dfl-input-size', width < 280 ? 'micro' : width < 600 ? 'compact' : 'regular')
      attr(root, 'data-dfl-stats-mode', (body?.getBoundingClientRect().width ?? width) < 320 ? 'scroll' : 'wrap')
    }
    for (const node of measuredRegions) if (!regions.has(node)) { resize.unobserve(node); measuredRegions.delete(node) }
    for (const node of regions) if (!measuredRegions.has(node)) { resize.observe(node); measuredRegions.add(node) }
    nativeToggle = findPart(parts.sidebar, 'toggle')
    if (button) {
      const icon = nativeToggle && (findPart(nativeToggle, 'panelIcon') ?? nativeToggle.querySelector('svg'))
      if (icon && icon.outerHTML !== toggleIcon) {
        toggleIcon = icon.outerHTML
        button.replaceChildren(icon.cloneNode(true))
        button.className = nativeToggle!.className
      }
      const leading = findPart(parts.center, 'headerLeading')
      const fallbackClose = !nativeToggle && !parts.frame.hasAttribute('data-sidebar-collapsed')
      const parent = !fallbackClose && leading ? leading : parts.frame
      if (button.parentElement !== parent) parent.prepend(button)
      button.dataset.dflInline = String(parent === leading)
      if (!parts.sidebar.id) attr(parts.sidebar, 'id', 'dfl-sidebar')
      button.setAttribute('aria-controls', parts.sidebar.id)
    }
    for (const dialog of doc.querySelectorAll<HTMLElement>('[role="dialog"]:has([data-session-stats-details], [data-session-stats-usage])')) role(dialog, 'stats-dialog')
    // Only semantic dialogs, never arbitrary plugin panels.
    for (const dialog of doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) role(dialog, 'dialog')
    for (const dialog of doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')) {
      for (const part of ['header', 'title', 'description', 'actions']) {
        for (const node of findParts(dialog, part)) role(node, `dialog-${part}`)
      }
    }
  }
  function update() {
    raf = 0
    if (disposed) return
    discover()
    if (!parts) return
    const width = parts.frame.getBoundingClientRect().width
    // Available space, not pointer type, decides the layout. Rotated phones
    // and short narrow windows must not regain a desktop rail at 768px.
    narrow = width > 0 && (width < 768 || (width < 1100 && win.innerHeight < 600))
    attr(html, 'data-dfl-active', '')
    attr(html, 'data-dfl-orientation', narrow && width >= 600 && width > win.innerHeight ? 'landscape' : 'portrait')
    attr(html, 'data-dfl-size', narrow ? 'compact' : width < 1100 ? 'medium' : 'wide')
    attr(parts.frame, 'data-dfl-size', html.getAttribute('data-dfl-size')!)
    const viewport = win.visualViewport
    // Pinch zoom must remain browser-owned. Only follow a 1:1 visual viewport.
    const follow = !viewport || Math.abs(viewport.scale - 1) < 0.02
    const height = follow ? (viewport?.height ?? win.innerHeight) : win.innerHeight
    const top = follow ? (viewport?.offsetTop ?? 0) : 0
    html.style.setProperty('--dfl-height', `${Math.round(height)}px`)
    html.style.setProperty('--dfl-top', `${Math.round(top)}px`)
    const open = narrow && legacy && !canvas && !parts.frame.hasAttribute('data-sidebar-collapsed')
    attr(parts.frame, 'data-dfl-open', String(open))
    if (button) {
      const hidden = !narrow || canvas || (open && !!nativeToggle)
      if (button.hidden !== hidden) button.hidden = hidden
      button.setAttribute('aria-expanded', String(open))
      button.setAttribute('aria-label', open ? '关闭侧边栏 / Close sidebar' : '打开侧边栏 / Open sidebar')
    }
    if (backdrop && backdrop.hidden !== !open) backdrop.hidden = !open
    if (narrow && legacy && !canvas) {
      inert(parts.sidebar, !open); inert(parts.center, open); inert(parts.rightbar, open)
    } else releaseInert()
    if (open && !drawerOpen) {
      previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
      parts.sidebar.querySelector<HTMLElement>('button, a[href], input, [tabindex="0"]')?.focus({ preventScroll: true })
    } else if (!open && drawerOpen) {
      if (narrow) (previousFocus?.isConnected && !previousFocus.closest('[inert]') && previousFocus.getClientRects().length ? previousFocus : button)?.focus({ preventScroll: true })
      previousFocus = null
    }
    drawerOpen = open
  }
  function schedule() { if (!disposed && !raf) raf = win.requestAnimationFrame(update) }
  function onKey(event: KeyboardEvent) {
    if (!drawerOpen || !parts) return
    // Let a menu/dialog above the drawer consume Escape and its own focus trap.
    if ([...doc.querySelectorAll<HTMLElement>('[role="dialog"], [role="menu"]')].some(node =>
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]'))) return
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const nodes = [button!, ...parts.sidebar.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex="0"]')]
      .filter(node => !node.hidden && !node.hasAttribute('disabled') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[inert]'))
    if (nodes.length) {
      event.preventDefault()
      const current = nodes.indexOf(doc.activeElement as HTMLElement)
      nodes[(current + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length]?.focus()
    }
  }
  function onSidebarClick(event: MouseEvent) {
    if (!drawerOpen || !parts || !(event.target instanceof Element) || !parts.sidebar.contains(event.target)) return
    // A session selection should expose its conversation, but menus/rename and
    // workspace expansion keep the drawer open.
    if (event.target.closest('[aria-haspopup], input, [role="menu"]')) return
    if (event.target.closest('[data-row-key^="session:"]')) close()
  }
  const observer = new MutationObserver(records => {
    // Text token streaming doesn't require a document scan.
    if (records.some(record => record.type === 'attributes'
      ? !(record.target instanceof HTMLElement && record.target.hasAttribute('data-dfl-owned'))
      : [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLElement && !node.hasAttribute('data-dfl-owned')))) schedule()
  })
  observer.observe(doc.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-sidebar-collapsed', 'data-sidebar-drawer', 'hidden', 'aria-hidden'] })
  const resize = new ResizeObserver(schedule)
  resize.observe(doc.documentElement)
  const listen = (target: EventTarget, event: string, handler: EventListener) => {
    target.addEventListener(event, handler); cleanups.push(() => target.removeEventListener(event, handler))
  }
  listen(win, 'resize', schedule); listen(doc, 'keydown', onKey as EventListener)
  listen(doc, 'click', onSidebarClick as EventListener)
  if (win.visualViewport) { listen(win.visualViewport, 'resize', schedule); listen(win.visualViewport, 'scroll', schedule) }
  update()
  return () => {
    disposed = true; if (raf) win.cancelAnimationFrame(raf)
    observer.disconnect(); resize.disconnect(); cleanups.forEach(stop => stop())
    releaseInert(); button?.remove(); backdrop?.remove(); style.remove()
    for (const toggle of statDocks.values()) toggle.remove()
    statDocks.clear()
    restore.reverse().forEach(reset => reset())
    oldVars.forEach(([key, value, priority]) => value ? html.style.setProperty(key, value, priority) : html.style.removeProperty(key))
  }
}
