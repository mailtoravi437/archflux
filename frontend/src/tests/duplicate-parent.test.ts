import { describe, it, expect } from 'vitest';
import { duplicateParentIds } from '../lib/duplicateParentIds';

// R1-BUG-02: duplicating a doc must keep containment inside the copy.
describe('duplicate keeps containment', () => {
  it('remaps parentId to the copied parent', () => {
    const idMap = new Map([['b1', 'n-new-b1'], ['c1', 'n-new-c1']]);
    expect(duplicateParentIds({ id: 'c1', parentId: 'b1' }, idMap).parentId).toBe('n-new-b1');
  });

  it('drops parentId when the parent was not copied', () => {
    const idMap = new Map([['c1', 'n-new-c1']]);
    expect(duplicateParentIds({ id: 'c1', parentId: 'gone' }, idMap).parentId).toBeUndefined();
  });
});
