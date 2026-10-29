import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { syncMap } from '../hooks/useCollaboration';

// CRDT sync primitive: two docs exchange updates, both converge.
describe('Yjs graph sync', () => {
  it('syncs node arrays between two docs via updates', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const mapA = docA.getMap('nodes');
    const mapB = docB.getMap('nodes');

    const nodes = [
      { id: 'a', label: 'Service A', x: 10, y: 20 },
      { id: 'b', label: 'DB', x: 30, y: 40 },
    ];
    docA.transact(() => {
      syncMap(mapA, nodes, (n: any) => n.id);
    }, 'local');

    // Ship update A -> B
    const update = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, update);

    expect(mapB.size).toBe(2);
    expect(mapB.get('a')).toMatchObject({ id: 'a', label: 'Service A' });
    expect(mapB.get('b')).toMatchObject({ id: 'b' });
  });

  it('deletes removed keys and updates changed ones', () => {
    const doc = new Y.Doc();
    const map = doc.getMap('nodes');
    doc.transact(() => {
      syncMap(map, [{ id: 'a', v: 1 }, { id: 'b', v: 1 }], (n: any) => n.id);
    }, 'local');
    expect(map.size).toBe(2);

    doc.transact(() => {
      syncMap(map, [{ id: 'a', v: 2 }], (n: any) => n.id);
    }, 'local');
    expect(map.size).toBe(1);
    expect(map.get('a')).toMatchObject({ v: 2 });
    expect(map.has('b')).toBe(false);
  });

  it('last-writer-wins converges concurrent edits', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const base = [{ id: 'a', x: 0 }];
    docA.transact(() => syncMap(docA.getMap('nodes'), base, (n: any) => n.id), 'local');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Concurrent moves on both sides
    docA.transact(() => syncMap(docA.getMap('nodes'), [{ id: 'a', x: 10 }], (n: any) => n.id), 'local');
    docB.transact(() => syncMap(docB.getMap('nodes'), [{ id: 'a', x: 20 }], (n: any) => n.id), 'local');

    // Exchange both ways; both docs converge to identical state
    const updateA = Y.encodeStateAsUpdate(docA);
    const updateB = Y.encodeStateAsUpdate(docB);
    Y.applyUpdate(docA, updateB);
    Y.applyUpdate(docB, updateA);

    expect(docA.getMap('nodes').toJSON()).toEqual(docB.getMap('nodes').toJSON());
  });
});
