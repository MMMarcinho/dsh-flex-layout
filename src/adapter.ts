/** DSH CSS modules retain semantic suffixes, but hashes change between builds.
 * Keep that private contract in one place; require matching siblings before
 * taking ownership of a frame. Never infer columns from child positions.
 */
export function hasPart(node: Element, part: string): boolean {
  return [...node.classList].some(token => token.endsWith(`_${part}`))
}
export function findPart(root: ParentNode, part: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(`[class*="_${part}"]`)].find(node => hasPart(node, part))
}
export function modulePeers(anchor: HTMLElement, part: string): HTMLElement[] {
  const token = [...anchor.classList].find(value => value.endsWith(`_${part}`))
  if (!token) return []
  const prefix = token.slice(0, -part.length)
  let root = anchor.parentElement ?? anchor
  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    if ([...parent.classList].some(value => value === `${prefix}root`)) { root = parent; break }
  }
  return [root, ...root.querySelectorAll<HTMLElement>('[class]')]
    .filter(node => [...node.classList].some(value => value.startsWith(prefix)))
}
export interface FrameParts { frame: HTMLElement; sidebar: HTMLElement; center: HTMLElement; rightbar: HTMLElement }
export function findFrame(doc: Document): FrameParts | undefined {
  for (const frame of doc.querySelectorAll<HTMLElement>('[class*="_frame"]')) {
    if (!hasPart(frame, 'frame')) continue
    const child = (part: string) => [...frame.children].find(node => hasPart(node, part)) as HTMLElement | undefined
    const sidebar = child('sidebarCol'), center = child('centerCol'), rightbar = child('rightbarCol')
    if (sidebar && center && rightbar) return { frame, sidebar, center, rightbar }
  }
}
