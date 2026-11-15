import type { ActionDefinition, RunState } from '../../shared/actions';

export interface RunPresentation { progress: boolean; result: boolean }
export function presentationFor(action: ActionDefinition, finalAction = action): RunPresentation {
  const card = (a: ActionDefinition) => a.output === 'card'
    && ['ai', 'script', 'readClipboard', 'screenshot'].includes(a.kind);
  return { progress: action.kind === 'workflow' || (card(action) && ['ai', 'script'].includes(action.kind)),
    result: card(finalAction) };
}

export function shouldShowRun(run: RunState, presentation: RunPresentation): boolean {
  if (run.status === 'failed') return true;
  if (run.status === 'running') return presentation.progress;
  return run.status === 'completed' && presentation.result && Boolean(run.text || run.image);
}
