/** Getting-started checklist logic (R1-E11-T05, SC-04). Steps are derived from real state, never ticked by hand. */
import type { DiagramDoc } from '../types';

export type ChecklistStep =
  | 'create_diagram'
  | 'add_5_elements'
  | 'connect_two'
  | 'invite_teammate'
  | 'share_or_publish'
  | 'connect_github';

export const CHECKLIST_STEPS: ChecklistStep[] = [
  'create_diagram',
  'add_5_elements',
  'connect_two',
  'invite_teammate',
  'share_or_publish',
  'connect_github',
];

export const CHECKLIST_LABEL: Record<ChecklistStep, string> = {
  create_diagram: 'Create a diagram',
  add_5_elements: 'Add 5 elements',
  connect_two: 'Connect two elements',
  invite_teammate: 'Invite a teammate',
  share_or_publish: 'Share or publish',
  connect_github: 'Connect GitHub',
};

export interface ChecklistInput {
  docs: DiagramDoc[];
  /** Teammates added or invited in the workspace (excluding yourself). */
  invitesSent: number;
  /** Share links or publishes created. 0 while no share state is available. */
  sharesMade: number;
  githubConnected: boolean;
  plan: string;
}

export function computeChecklist(input: ChecklistInput): Record<ChecklistStep, boolean> {
  const { docs } = input;
  return {
    create_diagram: docs.some((d) => d.nodes.length > 0 || d.edges.length > 0),
    add_5_elements: docs.some((d) => d.nodes.length >= 5),
    connect_two: docs.some((d) => d.edges.some((e) => !!e.to && !e.isDangling)),
    invite_teammate: input.invitesSent > 0,
    share_or_publish: input.sharesMade > 0,
    connect_github: input.githubConnected,
  };
}

/** Connect GitHub is a Team feature, so it is hidden on Free (legacy `member` counts as Free). */
export function visibleChecklistSteps(plan: string): ChecklistStep[] {
  const free = plan === 'free' || plan === 'member' || plan === '';
  return CHECKLIST_STEPS.filter((s) => s !== 'connect_github' || !free);
}

const KEY = 'archflux:checklist:v1';

function read(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** `userKey` is the signed-in email, or `guest`. */
export function isChecklistDismissed(userKey: string): boolean {
  return read()[userKey] === true;
}

export function dismissChecklist(userKey: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [userKey]: true }));
  } catch {
    /* ignore */
  }
}
