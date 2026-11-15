import { randomUUID } from 'node:crypto';
import { idleRun, validateWorkflow, type ActionDefinition, type ActionValue, type InputSource,
  type RunState, type WorkbenchSettings } from '../../shared/actions';
import { presentationFor, type RunPresentation } from './presentation';

export interface RunTarget { window: string; selection: string; x: number; y: number }
export interface ExecutionContext {
  target: RunTarget;
  settings: WorkbenchSettings;
  signal: AbortSignal;
  delta(text: string): void;
  usage(input: number, output: number): void;
}
export interface RunnerDeps {
  input(source: InputSource, previous: ActionValue, target: RunTarget, signal: AbortSignal): Promise<ActionValue>;
  execute(action: ActionDefinition, value: ActionValue, ctx: ExecutionContext): Promise<ActionValue>;
  publish(state: RunState): void;
}
export class ActionRunner {
  state = idleRun();
  presentation: RunPresentation = { progress: false, result: false };
  private controller: AbortController | null = null;
  constructor(private readonly deps: RunnerDeps) {}
  get busy(): boolean { return this.controller !== null; }
  cancel(): void { this.controller?.abort(); }
  private emit(patch: Partial<RunState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.publish({ ...this.state });
  }
  async run(id: string, settings: WorkbenchSettings, target: RunTarget): Promise<void> {
    if (this.busy) throw new Error('busy');
    const snapshot = structuredClone(settings);
    const action = snapshot.actions.find(a => a.id === id);
    if (!action) throw new Error('missing');
    const flow = action.kind === 'workflow' ? snapshot.workflows.find(f => f.id === action.value) : undefined;
    if (action.kind === 'workflow' && (!flow || validateWorkflow(flow, snapshot).length)) throw new Error('workflowInvalid');
    const steps = flow?.steps ?? [{ id, actionId: id, input: action.input }];
    this.presentation = presentationFor(action, snapshot.actions.find(a => a.id === steps.at(-1)?.actionId));
    const controller = new AbortController();
    this.controller = controller;
    this.state = { ...idleRun(), id: randomUUID(), name: action.name, status: 'running', total: steps.length };
    this.emit({});
    let previous: ActionValue = {};
    try {
      for (let index = 0; index < steps.length; index++) {
        controller.signal.throwIfAborted();
        const step = steps[index];
        const definition = snapshot.actions.find(a => a.id === step.actionId);
        if (!definition) throw new Error('missing');
        this.emit({ step: index + 1, text: '', image: undefined });
        const value = await this.deps.input(step.input, previous, target, controller.signal);
        controller.signal.throwIfAborted();
        const timeout = AbortSignal.timeout(definition.timeoutS * 1000);
        const signal = AbortSignal.any([controller.signal, timeout]);
        previous = await this.deps.execute(definition, value, { signal, target, settings: snapshot,
          delta: text => { if (!signal.aborted) this.emit({ text: this.state.text + text }); },
          usage: (input, output) => this.emit({ inputTokens: this.state.inputTokens + input, outputTokens: this.state.outputTokens + output }),
        });
        signal.throwIfAborted();
        this.emit({ text: previous.text ?? '', image: previous.image ? `data:image/jpeg;base64,${previous.image.data}` : undefined });
      }
      this.emit({ status: 'completed' });
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && error.message === 'cancelled');
      this.emit({ status: cancelled ? 'cancelled' : 'failed',
        error: cancelled ? '' : error instanceof Error ? error.message : 'failed' });
    } finally { this.controller = null; }
  }
}
