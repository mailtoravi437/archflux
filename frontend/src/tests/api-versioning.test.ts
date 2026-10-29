import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, isForbiddenError, isVersionConflictError } from '../lib/api';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('api optimistic-concurrency + error shape', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends version on PUT when known, and force when asked', async () => {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = (async (url: unknown, opts: unknown) => {
      calls.push({ url: String(url), body: String((opts as { body?: string }).body ?? '') });
      return jsonResponse({ data: { id: 'x', version: 4 } });
    }) as typeof fetch;

    const id = '123e4567-e89b-12d3-a456-426614174000';
    await api.updateDiagram(id, { title: 't' }, { version: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/v1/diagrams/${id}`);
    expect(JSON.parse(calls[0].body)).toMatchObject({ version: 3 });

    await api.updateDiagram(id, { title: 't' }, { version: 3, force: true });
    expect(JSON.parse(calls[1].body)).toMatchObject({ version: 3, force: true });
  });

  it('omits version when unknown (first save)', async () => {
    let body = '';
    globalThis.fetch = (async (_url: unknown, opts: unknown) => {
      body = String((opts as { body?: string }).body ?? '');
      return jsonResponse({ data: { id: 'x' } });
    }) as typeof fetch;
    await api.updateDiagram('123e4567-e89b-12d3-a456-426614174000', { title: 't' });
    expect('version' in JSON.parse(body)).toBe(false);
  });

  it('throws ApiError carrying code + status on 409', async () => {
    globalThis.fetch = (async () => {
      return jsonResponse({ error: { code: 'VERSION_CONFLICT', message: 'stale write' } }, 409);
    }) as typeof fetch;
    const err = await api
      .updateDiagram('123e4567-e89b-12d3-a456-426614174000', {}, { version: 1 })
      .then(
        () => null,
        (e) => e,
      );
    expect(err).toBeInstanceOf(ApiError);
    expect(isVersionConflictError(err)).toBe(true);
    expect((err as ApiError).code).toBe('VERSION_CONFLICT');
    expect((err as ApiError).status).toBe(409);
  });

  it('detects 403s for the admin-only audit/revision paths', async () => {
    globalThis.fetch = (async () => {
      return jsonResponse({ error: { code: 'FORBIDDEN', message: 'admin only' } }, 403);
    }) as typeof fetch;
    const err = await api.listRevisions('123e4567-e89b-12d3-a456-426614174000').then(
      () => null,
      (e) => e,
    );
    expect(isForbiddenError(err)).toBe(true);
  });

  it('hits the contract revision/diff/audit URLs', async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      urls.push(String(url));
      return jsonResponse({ data: [] });
    }) as typeof fetch;
    const id = '123e4567-e89b-12d3-a456-426614174000';
    await api.listRevisions(id);
    await api.diffRevisions(id, 'r1', 'r2');
    await api.listAudit('ws-1', 10);
    expect(urls[0]).toContain(`/v1/diagrams/${id}/revisions`);
    expect(urls[1]).toContain(`/v1/diagrams/${id}/diff?from=r1&to=r2`);
    expect(urls[2]).toContain('/v1/audit?workspaceId=ws-1&limit=10');
  });
});
