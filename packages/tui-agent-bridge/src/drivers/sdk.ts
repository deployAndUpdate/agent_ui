import type { BridgeConfig } from '../types.js';

const WARM_KEY = '__warm__';

type DurableAgent = {
  send: (prompt: string) => Promise<{
    stream?: () => AsyncIterable<unknown>;
    wait?: () => Promise<unknown>;
    result?: unknown;
  }>;
  close?: () => Promise<void> | void;
  [Symbol.asyncDispose]?: () => Promise<void>;
};

/**
 * Process-lifetime Cursor agents: Agent.create once, then agent.send per job.
 * First real session reuses the warmup agent so /details is not a cold create.
 */
export class SdkAgentPool {
  private agents = new Map<string, DurableAgent>();
  private createLock: Promise<void> = Promise.resolve();

  constructor(private readonly cfg: BridgeConfig) {}

  async warmup(): Promise<void> {
    await this.ensure(WARM_KEY);
  }

  async send(sessionId: string, prompt: string): Promise<string> {
    try {
      return await this.sendOnce(sessionId, prompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[bridge] sdk send failed, recreating agent: ${message}`);
      await this.drop(sessionId);
      return this.sendOnce(sessionId, prompt);
    }
  }

  async close(): Promise<void> {
    const all = [...this.agents.values()];
    this.agents.clear();
    await Promise.all(all.map((a) => disposeAgent(a)));
  }

  private async sendOnce(sessionId: string, prompt: string): Promise<string> {
    const agent = await this.ensure(sessionId);
    const run = await agent.send(prompt);
    const streamed = await collectStreamText(run);
    const waited = run.wait ? await run.wait() : run.result;
    if (isFailedRun(waited)) {
      throw new Error(`Cursor SDK run failed: ${runId(waited)}`);
    }
    const text = extractRunText(waited, streamed);
    if (!text.trim()) {
      throw new Error('Cursor SDK returned empty result');
    }
    return text;
  }

  private async ensure(sessionId: string): Promise<DurableAgent> {
    const hit = this.agents.get(sessionId);
    if (hit) return hit;

    let release!: () => void;
    const prev = this.createLock;
    this.createLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      const again = this.agents.get(sessionId);
      if (again) return again;
      const boot = this.agents.get(WARM_KEY);
      if (boot && sessionId !== WARM_KEY) {
        this.agents.delete(WARM_KEY);
        this.agents.set(sessionId, boot);
        return boot;
      }
      const created = await this.createAgent();
      this.agents.set(sessionId, created);
      return created;
    } finally {
      release();
    }
  }

  private async drop(sessionId: string): Promise<void> {
    const a = this.agents.get(sessionId) ?? this.agents.get(WARM_KEY);
    this.agents.delete(sessionId);
    this.agents.delete(WARM_KEY);
    if (a) await disposeAgent(a);
  }

  private async createAgent(): Promise<DurableAgent> {
    let Agent: typeof import('@cursor/sdk').Agent;
    try {
      ({ Agent } = await import('@cursor/sdk'));
    } catch {
      throw new Error(
        '@cursor/sdk not installed — npm i @cursor/sdk -w @visual-engine/tui-agent-bridge',
      );
    }
    if (!this.cfg.apiKey) {
      throw new Error('CURSOR_API_KEY required for TUI_BRIDGE_DRIVER=sdk');
    }

    return Agent.create({
      apiKey: this.cfg.apiKey,
      model: { id: this.cfg.model || 'composer-2.5' },
      local: { cwd: this.cfg.workspace },
    }) as Promise<DurableAgent>;
  }
}

async function disposeAgent(agent: DurableAgent): Promise<void> {
  try {
    if (typeof agent.close === 'function') {
      await agent.close();
      return;
    }
    if (typeof agent[Symbol.asyncDispose] === 'function') {
      await agent[Symbol.asyncDispose]();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[bridge] sdk dispose: ${message}`);
  }
}

async function collectStreamText(run: {
  stream?: () => AsyncIterable<unknown>;
}): Promise<string> {
  if (typeof run.stream !== 'function') return '';
  let out = '';
  try {
    for await (const event of run.stream()) {
      out += assistantTextFromEvent(event);
    }
  } catch {
    // wait() still required; stream is observational
  }
  return out;
}

function assistantTextFromEvent(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const e = event as {
    type?: string;
    message?: { content?: Array<{ type?: string; text?: string }> };
  };
  if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return '';
  return e.message.content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}

function isFailedRun(result: unknown): boolean {
  return Boolean(
    result &&
      typeof result === 'object' &&
      (result as { status?: string }).status === 'error',
  );
}

function runId(result: unknown): string {
  if (result && typeof result === 'object' && 'id' in result) {
    return String((result as { id: unknown }).id ?? 'unknown');
  }
  return 'unknown';
}

function extractRunText(result: unknown, streamed: string): string {
  if (streamed.trim()) return streamed.trim();
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return '';
  const r = result as {
    result?: unknown;
    text?: unknown;
  };
  if (typeof r.result === 'string') return r.result;
  if (typeof r.text === 'string') return r.text;
  if (r.result != null) {
    if (typeof r.result === 'object' && r.result && 'text' in r.result) {
      const t = (r.result as { text: unknown }).text;
      if (typeof t === 'string') return t;
    }
    return JSON.stringify(r.result);
  }
  return '';
}
