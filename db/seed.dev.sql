-- ArchFlux dev seed (local development ONLY — never apply to staging/prod).
--
--   psql "host=localhost port=5432 dbname=archflux user=postgres" \
--     -v ON_ERROR_STOP=1 -f db/seed.dev.sql
--
-- Idempotent: fixed UUIDs + bare ON CONFLICT DO NOTHING on every row, so re-running
-- never raises duplicate-key errors (second run inserts 0 rows).
-- Contents: 1 demo user + 1 diagram (small checkout mesh: 3 nodes / 2 edges) +
-- 1 checkpoint + 1 thread + 1 reply (reply included so replies-by-thread can be
-- exercised by hand; the contract minimum is user/diagram/checkpoint/thread).

-- Demo user (fixed id so FK targets are stable across re-runs).
INSERT INTO public.users (id, email, name, role)
VALUES ('a1111111-1111-4111-8111-111111111111', 'demo@archflux.local', 'Demo User', 'admin')
ON CONFLICT DO NOTHING;

-- API dev user: the server's single-token dev auth acts as this id
-- (matches server DEV_USER_UUID in server/src/config.ts). Seeded here so writes never hit FK 23503.
INSERT INTO public.users (id, email, name, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'dev@archflux.local', 'Dev User', 'admin')
ON CONFLICT DO NOTHING;

-- Demo diagram: small checkout mesh, 3 nodes / 2 edges.
INSERT INTO public.diagrams (id, owner_id, title, tags, graph)
VALUES (
  'b2222222-2222-4222-8222-222222222222',
  'a1111111-1111-4111-8111-111111111111',
  'Checkout mesh (dev seed)',
  ARRAY['demo', 'checkout'],
  $${
    "nodes": [
      {"id": "storefront", "label": "Storefront", "service": "web"},
      {"id": "checkout", "label": "Checkout", "service": "checkout"},
      {"id": "payments", "label": "Payments", "service": "payments"}
    ],
    "edges": [
      {"id": "e1", "from": "storefront", "to": "checkout", "label": "cart checkout"},
      {"id": "e2", "from": "checkout", "to": "payments", "label": "charge"}
    ]
  }$$::jsonb
)
ON CONFLICT DO NOTHING;

-- Checkpoint pinning the seed graph.
INSERT INTO public.checkpoints (id, diagram_id, title, meta, snapshot)
VALUES (
  'c3333333-3333-4333-8333-333333333333',
  'b2222222-2222-4222-8222-222222222222',
  'Initial checkout mesh',
  'dev seed',
  $${
    "nodes": [
      {"id": "storefront", "label": "Storefront", "service": "web"},
      {"id": "checkout", "label": "Checkout", "service": "checkout"},
      {"id": "payments", "label": "Payments", "service": "payments"}
    ],
    "edges": [
      {"id": "e1", "from": "storefront", "to": "checkout", "label": "cart checkout"},
      {"id": "e2", "from": "checkout", "to": "payments", "label": "charge"}
    ]
  }$$::jsonb
)
ON CONFLICT DO NOTHING;

-- Review thread on the diagram, pinned to the checkout node.
INSERT INTO public.threads (id, diagram_id, author, pinned_to, text, resolved)
VALUES (
  'd4444444-4444-4444-8444-444444444444',
  'b2222222-2222-4222-8222-222222222222',
  'demo',
  'checkout',
  'Should checkout call payments synchronously here?',
  false
)
ON CONFLICT DO NOTHING;

-- One reply so the thread view / replies-by-thread query has data.
INSERT INTO public.replies (id, thread_id, author, text)
VALUES (
  'e5555555-5555-4555-8555-555555555555',
  'd4444444-4444-4444-8444-444444444444',
  'demo',
  'Keeping it sync for the seed; async retry comes later.'
)
ON CONFLICT DO NOTHING;
