import type { ArchEdge, ArchNode } from './types';

/**
 * API contract derivation (local-first, deterministic).
 *
 * There is no contract backend: endpoints are derived from the diagram graph
 * itself — routes between services/gateways with an HTTP method, an RPC hint,
 * or an explicit protocol tag. Data-plane ops (SETNX, SQL commits) and
 * dangling wires are deliberately excluded; the linter owns those.
 */

export type ContractStatus = 'verified' | 'drift' | 'unknown';

export interface ApiEndpoint {
  /** Source edge id (stable key for React). */
  id: string;
  method: string;
  path: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  protocol: string;
  status: ContractStatus;
  /** Original route label, for traceability. */
  label: string;
}

const HTTP_METHOD_RE = /^\s*(GET|POST|PUT|PATCH|DELETE)\b/i;
const PATH_RE = /(\/[A-Za-z0-9_~.\-/{}:]*)/;
const DATA_OP_RE = /SETNX|commit\s+state|\bSQL\b|lock$/i;
const PUB_RE = /^\s*pub\s*:/i;
const SUB_RE = /consume|subscribe|\bsub\b/i;

export function slugify(label: string): string {
  return (label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'root';
}

function inferProtocol(edge: ArchEdge): string {
  if (edge.protocol && edge.protocol.trim()) return edge.protocol.trim();
  const label = edge.label ?? '';
  if (/grpc/i.test(label)) return 'gRPC';
  if (PUB_RE.test(label) || SUB_RE.test(label)) return 'Async';
  if (/websocket|\bws\b/i.test(label)) return 'WebSocket';
  if (HTTP_METHOD_RE.test(label)) return 'REST';
  return '';
}

function inferMethod(edge: ArchEdge, protocol: string, from?: ArchNode, to?: ArchNode): string | null {
  const label = edge.label ?? '';
  const http = label.match(HTTP_METHOD_RE);
  if (http) return http[1].toUpperCase();
  if (/grpc/i.test(label)) return 'RPC';
  if (PUB_RE.test(label)) return 'PUB';
  if (SUB_RE.test(label)) return 'SUB';
  if (DATA_OP_RE.test(label)) return null;
  if (protocol === 'REST') return 'GET';
  if (protocol === 'gRPC') return 'RPC';
  if (protocol === 'WebSocket') return 'WS';
  if (protocol === 'Async') return 'EVENT';
  // Untagged route between API-capable nodes defaults to a GET contract.
  const apiKind = (n?: ArchNode) => n && (n.type === 'service' || n.type === 'gateway');
  if (apiKind(from) && apiKind(to)) return 'GET';
  return null;
}

function inferPath(edge: ArchEdge, to?: ArchNode): string {
  const m = (edge.label ?? '').match(PATH_RE);
  if (m) return m[1];
  return `/${slugify(to?.label ?? 'root')}`;
}

function inferStatus(edge: ArchEdge, to?: ArchNode): ContractStatus {
  if (!edge.to || !to) return 'drift';
  if (to.isOrphan) return 'drift';
  if (edge.protocol && edge.protocol.trim()) return 'verified';
  return 'unknown';
}

export function deriveEndpoints(nodes: ArchNode[], edges: ArchEdge[]): ApiEndpoint[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: ApiEndpoint[] = [];
  for (const edge of edges) {
    if (!edge.to) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!to) continue;
    const protocol = inferProtocol(edge);
    const method = inferMethod(edge, protocol, from, to);
    if (!method) continue;
    out.push({
      id: edge.id,
      method,
      path: inferPath(edge, to),
      fromId: edge.from,
      toId: edge.to,
      fromLabel: from?.label ?? edge.from,
      toLabel: to.label,
      protocol: protocol || 'REST',
      status: inferStatus(edge, to),
      label: edge.label,
    });
  }
  return out;
}

export function endpointsForNode(nodeId: string, endpoints: ApiEndpoint[]): ApiEndpoint[] {
  return endpoints.filter((e) => e.fromId === nodeId || e.toId === nodeId);
}

export function endpointForEdge(edgeId: string, endpoints: ApiEndpoint[]): ApiEndpoint | undefined {
  return endpoints.find((e) => e.id === edgeId);
}

export function contractSummary(endpoints: ApiEndpoint[]): { total: number; drift: number; verified: number } {
  return {
    total: endpoints.length,
    drift: endpoints.filter((e) => e.status === 'drift').length,
    verified: endpoints.filter((e) => e.status === 'verified').length,
  };
}
