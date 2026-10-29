/** Recording CanvasRenderingContext2D for renderer tests: every call is logged with the state at that moment. 7 px per character. */
export interface Call { op: string; args: unknown[]; font: string; dash: number[]; fillStyle: string; strokeStyle: string; lineWidth: number; textAlign: string; globalAlpha: number }

export function recordingCtx() {
  const calls: Call[] = [];
  const state = { font: '', dash: [] as number[], fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left', globalAlpha: 1 };
  const snap = (op: string, args: unknown[]): Call => ({ op, args, font: state.font, dash: state.dash, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, lineWidth: state.lineWidth, textAlign: state.textAlign, globalAlpha: state.globalAlpha });
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (_t, p) => {
      if (p === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (p === 'setLineDash') return (d: number[]) => { state.dash = [...d]; calls.push(snap('setLineDash', [d])); };
      if (p === 'font') return state.font;
      if (typeof p !== 'string') return undefined;
      return (...args: unknown[]) => { calls.push(snap(p, args)); };
    },
    set: (_t, p, v) => {
      if (p === 'font') state.font = String(v);
      if (p === 'fillStyle') state.fillStyle = String(v);
      if (p === 'strokeStyle') state.strokeStyle = String(v);
      if (p === 'lineWidth') state.lineWidth = Number(v);
      if (p === 'textAlign') state.textAlign = String(v);
      if (p === 'globalAlpha') state.globalAlpha = Number(v);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
