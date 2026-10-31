// BUG-LIVE-018: a local checkpoint never claims a check ran or passed.
import { describe, expect, it } from 'vitest';
import { deriveCheckpointPRs } from '../screens/GitScreen';

const cp = (over = {}) => ({ id: 'a', title: 'untitled', meta: 'm', active: true, nodes: [{ label: 'S', tag: 't' }], edges: [], ...over });

describe('deriveCheckpointPRs honesty', () => {
  it('has no check results and no pass claim', () => {
    const [pr] = deriveCheckpointPRs([cp()]);
    expect(pr.checks).toEqual([]);
    expect(pr.status).not.toMatch(/pass|ready/i);
    expect(pr.status).toBe('Local checkpoint');
  });
  it('inactive checkpoints are still not claimed as passed', () => {
    const [pr] = deriveCheckpointPRs([cp({ active: false })]);
    expect(pr.checks).toEqual([]);
    expect(pr.status).toBe('Draft');
  });
  it('does not prefix the checkpoint name with "PR:"', () => {
    expect(deriveCheckpointPRs([cp()])[0].title).toBe('untitled');
  });
  it('empty input gives empty output', () => {
    expect(deriveCheckpointPRs([])).toEqual([]);
  });
});
