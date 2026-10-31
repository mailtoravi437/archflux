import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDiagram } from '../state/useDiagram';
import { blueprintGraph, blueprints } from '../data/blueprints';
import { libraryShapes } from '../canvas/ShapeRegistry';
import WorkspaceSetup from '../components/onboarding/WorkspaceSetup';
import { isWorkspaceSetupDone } from '../lib/workspaceSetup';
import { isSignedIn } from '../state/session';

const PROVIDER_ALIASES: Record<string, string[]> = {
  AWS: ['aws'],
  'Google Cloud': ['gcp', 'google'],
  Azure: ['azure'],
  Kubernetes: ['k8s', 'kubernetes', 'gke', 'aks', 'eks'],
  Kafka: ['kafka'],
  Snowflake: ['snowflake'],
};

/** Shapes visible for the selected stacks (empty selection = everything). Exported for tests. */
export function previewShapesForProviders(providers: string[]) {
  if (providers.length === 0) return libraryShapes;
  const needles = providers.flatMap((p) => PROVIDER_ALIASES[p] ?? [p.toLowerCase()]);
  return libraryShapes.filter((s) => {
    const hay = `${s.provider ?? ''} ${s.tag ?? ''} ${s.label ?? ''}`.toLowerCase();
    return needles.some((n) => hay.includes(n.toLowerCase()));
  });
}

const ONBOARDED_KEY = 'archflux:onboarded';
const PROVIDERS_KEY = 'archflux:providers';

const PERSONAS = [
  { id: 'platform', title: 'Platform / Backend Engineer', desc: 'K8s, gRPC, Redis, Kafka. Shortcuts tuned for services & streams.', recs: ['event-kafka-cqrs', 'k8s-service-mesh', 'ledger-sourcing'] },
  { id: 'architect', title: 'Solutions Architect / Tech Lead', desc: 'Cloud boundaries, ADRs, compliance. VPC & mesh blueprints first.', recs: ['multi-region-vpc', 'k8s-service-mesh', 'zero-trust-gateway'] },
  { id: 'designer', title: 'Product / Systems Designer', desc: 'User journeys, API gateways, databases. Gateway & data shapes first.', recs: ['graphql-federation', 'rag-pipeline', 'ledger-sourcing'] },
  { id: 'other', title: 'Other / Not sure', desc: 'Show me everything — all categories and providers.', recs: ['event-kafka-cqrs', 'multi-region-vpc', 'graphql-federation'] },
];

const PROVIDERS = ['AWS', 'Google Cloud', 'Azure', 'Kubernetes', 'Kafka', 'Snowflake'];

function LibraryPreview({ providers }: { providers: string[] }) {
  const shapes = previewShapesForProviders(providers);
  const shown = shapes.slice(0, 6);
  return (
    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }} role="status" aria-live="polite">
      Your shape library will show <strong>{shapes.length} {shapes.length === 1 ? 'shape' : 'shapes'}</strong>
      {providers.length > 0 && <> for {providers.join(', ')}</>}
      {shown.length > 0 && (
        <span style={{ marginLeft: 8 }}>
          {shown.map((s) => (
            <span key={s.id} title={s.label} style={{ marginRight: 4, fontSize: 15 }}>
              {s.iconSrc ? <img src={s.iconSrc} alt="" style={{ width: 16, height: 16, verticalAlign: '-3px' }} /> : s.icon}
            </span>
          ))}
          {shapes.length > shown.length && <span>…</span>}
        </span>
      )}
      {shapes.length === 0 && <> — clear the selection to see everything.</>}
    </div>
  );
}

export default function OnboardingScreen() {
  const navigate = useNavigate();
  const { pushToast, pushLog, loadGraph } = useDiagram();
  const [step, setStep] = useState(1);
  const [persona, setPersona] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [seed, setSeed] = useState<string>('blank');
  // SC-02: signed-in users set up or join a workspace first (R1-E11-T03).
  useEffect(() => {
    document.title = 'Set up · ArchFlux';
  }, []);
  const [needsWorkspace, setNeedsWorkspace] = useState(() => isSignedIn() && !isWorkspaceSetupDone());

  const personaRecs = PERSONAS.find((p) => p.id === persona)?.recs ?? ['event-kafka-cqrs', 'k8s-service-mesh', 'zero-trust-gateway'];
  const recBlueprints = personaRecs
    .map((id) => blueprints.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  const toggleProvider = (p: string) =>
    setProviders((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const finishRef = useRef<() => void>(undefined);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDED_KEY, 'true');
      localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
      if (persona) localStorage.setItem('archflux:persona', persona);
    } catch {
      /* ignore */
    }
    pushLog(`Onboarding complete: ${persona ?? 'no persona'} [${providers.join(', ') || 'all stacks'}]`);
    if (seed !== 'blank') {
      const g = blueprintGraph(seed);
      loadGraph(g.nodes, g.edges, `Started from blueprint (${g.nodes.length}n)`);
    }
    pushToast('Workspace ready — happy architecting');
    navigate('/canvas', { replace: true });
  }, [persona, providers, seed, pushLog, pushToast, navigate, loadGraph]);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  // Keyboard flow advertised on step 1: 1–4 selects a persona, Enter continues.
  useEffect(() => {
    if (step !== 1) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key >= '1' && e.key <= String(PERSONAS.length)) {
        const p = PERSONAS[Number(e.key) - 1];
        if (p) setPersona(p.id);
      } else if (e.key === 'Enter' && persona) {
        setStep(2);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, persona]);

  if (needsWorkspace) {
    return (
      <div style={{ minHeight: '100vh', background: '#F6F7F9', color: '#1B1F27', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 40, boxSizing: 'border-box' }}>
        <main><WorkspaceSetup onDone={() => setNeedsWorkspace(false)} /></main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app, #F7F7F5)', display: 'flex', justifyContent: 'center', padding: 40 }}>
      <main style={{ width: 720, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <img src="/icons/tools/select.svg" alt="" style={{ width: 24, height: 24 }} />
          <h1 style={{ margin: 0, fontSize: 'inherit', fontWeight: 700 }}>ArchFlux setup</h1>
          <span style={{ flex: 1 }} />
          <button className="btn btn--sm btn--secondary" onClick={finish} title="Skip onboarding — you can change these anytime in Settings">Skip for now →</button>
        </div>
        {/* Progress bar: 1. Role → 2. Cloud Stack → 3. First Topology */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }} role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3} aria-label="Setup progress">
          {['1. Role', '2. Cloud Stack', '3. First Topology'].map((label, i) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 11,
                fontFamily: 'var(--mono-font)',
                padding: '6px 0',
                borderRadius: 6,
                background: step > i ? 'var(--accent-cyan, #2563EB)' : 'var(--bg-panel, #fff)',
                color: step > i ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-panel)',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="content-card">
          {step === 1 && (
            <div>
              <div className="card-head"><span className="card-title">What best describes you?</span></div>
              <p className="card-sub">Press 1–4 to select, Enter to continue.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                {PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    aria-pressed={persona === p.id}
                    style={{
                      textAlign: 'left',
                      borderRadius: 8,
                      padding: 14,
                      cursor: 'pointer',
                      border: persona === p.id ? '2px solid var(--accent-cyan, #2563EB)' : '1px solid var(--border-panel)',
                      background: 'var(--bg-panel-subtle)',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn btn-primary" disabled={!persona} onClick={() => setStep(2)}>Continue →</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="card-head"><span className="card-title">Which stacks do you work with?</span></div>
              <p className="card-sub">These pre-filter the Canvas Shape Library on first load.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    className={`btn btn--sm btn--${providers.includes(p) ? 'primary' : 'secondary'}`}
                    aria-pressed={providers.includes(p)}
                    onClick={() => toggleProvider(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <LibraryPreview providers={providers} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button className="btn btn--sm btn--secondary" onClick={() => setStep(1)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setStep(3)}>Continue →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="card-head"><span className="card-title">Start with a topology</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setSeed('blank')}
                  aria-pressed={seed === 'blank'}
                  style={{ textAlign: 'left', borderRadius: 8, padding: 12, border: seed === 'blank' ? '2px solid var(--accent-cyan, #2563EB)' : '1px solid var(--border-panel)', background: 'var(--bg-panel-subtle)', cursor: 'pointer' }}
                >
                  <strong>Start with Blank Canvas</strong>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Empty graph — add services or load a blueprint later</div>
                </button>
                {recBlueprints.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSeed(b.id)}
                    aria-pressed={seed === b.id}
                    style={{ textAlign: 'left', borderRadius: 8, padding: 12, border: seed === b.id ? '2px solid var(--accent-cyan, #2563EB)' : '1px solid var(--border-panel)', background: 'var(--bg-panel-subtle)', cursor: 'pointer' }}
                  >
                    <strong>{b.icon} {b.title}</strong>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
                <button className="btn btn--sm btn--secondary" onClick={() => setStep(2)}>← Back</button>
                <button className="btn btn-primary" onClick={finish}>Open workspace →</button>
              </div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, textAlign: 'center' }}>
          You can change these anytime in Settings → General
        </div>
      </main>
    </div>
  );
}
