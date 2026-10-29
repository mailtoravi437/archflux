import { useContext } from 'react';
import {
  DiagramCoreContext,
  DiagramActionsContext,
  DiagramUIContext,
  DiagramDocsContext,
  DiagramCollabContext,
} from './store';
import type {
  DiagramCoreContextValue,
  DiagramActionsContextValue,
  DiagramUIContextValue,
  DiagramDocsContextValue,
  DiagramCollabContextValue,
  CanvasTool,
  LayoutKind,
} from './store';

function useCore(): DiagramCoreContextValue {
  const ctx = useContext(DiagramCoreContext);
  if (!ctx) throw new Error('useCore must be used within DiagramProvider');
  return ctx;
}

function useActions(): DiagramActionsContextValue {
  const ctx = useContext(DiagramActionsContext);
  if (!ctx) throw new Error('useActions must be used within DiagramProvider');
  return ctx;
}

function useUI(): DiagramUIContextValue {
  const ctx = useContext(DiagramUIContext);
  if (!ctx) throw new Error('useUI must be used within DiagramProvider');
  return ctx;
}

function useDocs(): DiagramDocsContextValue {
  const ctx = useContext(DiagramDocsContext);
  if (!ctx) throw new Error('useDocs must be used within DiagramProvider');
  return ctx;
}

function useCollab(): DiagramCollabContextValue {
  const ctx = useContext(DiagramCollabContext);
  if (!ctx) throw new Error('useCollab must be used within DiagramProvider');
  return ctx;
}

export function useDiagram(): DiagramCoreContextValue & DiagramActionsContextValue & DiagramUIContextValue & DiagramDocsContextValue & DiagramCollabContextValue {
  const core = useCore();
  const actions = useActions();
  const ui = useUI();
  const docs = useDocs();
  const collab = useCollab();
  return { ...core, ...actions, ...ui, ...docs, ...collab };
}

export function useCoreDiagram(): DiagramCoreContextValue { return useCore(); }
export function useDiagramActions(): DiagramActionsContextValue { return useActions(); }
export function useDiagramUI(): DiagramUIContextValue { return useUI(); }
export function useDiagramDocs(): DiagramDocsContextValue { return useDocs(); }
export function useDiagramCollab(): DiagramCollabContextValue { return useCollab(); }

export type { CanvasTool, LayoutKind };