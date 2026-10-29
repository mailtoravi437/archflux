/** Remaps a node's parentId for a duplicated doc (R1-BUG-02). Drops it when the parent was not copied. */
export function duplicateParentIds<T extends { parentId?: string | null }>(node: T, idMap: Map<string, string>): T {
  const copy = { ...node };
  if (typeof node.parentId === 'string') {
    const pid = idMap.get(node.parentId);
    if (pid) copy.parentId = pid;
    else delete copy.parentId;
  }
  return copy;
}
