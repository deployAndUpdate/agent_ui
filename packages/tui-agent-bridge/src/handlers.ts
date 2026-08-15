import {
  buildEnrichPrompt,
  buildPromptFollowUp,
  errorEnrichManifest,
  stubEnrichManifest,
} from './enrich.js';
import { postManifestCallback } from './callback.js';
import {
  normalizeDetailManifest,
  normalizePatchManifest,
} from './parseManifest.js';
import { SessionQueue } from './queue.js';
import {
  currentDetailFromBody,
  mergeDetailChunks,
  stubPromptPatch,
} from './mergeChunks.js';
import { runAgentCli } from './drivers/cli.js';
import { SdkAgentPool } from './drivers/sdk.js';
import { runExecDriver } from './drivers/exec.js';
import { runForwardDriver } from './drivers/forward.js';
import type { AgentWebhookBody, BridgeConfig } from './types.js';
import type { TuiManifest } from '@visual-engine/tui-shared';

export const COMMAND_HANDLERS = ['/details', '/prompt'] as const;

export type LlmStatus = 'n/a' | 'warming' | 'ready' | 'error';

type JobResult =
  | { kind: 'manifest'; manifest: TuiManifest }
  | { kind: 'peer_callback' };

export function isKnownCommand(command: string): boolean {
  return (COMMAND_HANDLERS as readonly string[]).includes(command.trim());
}

export class DaemonRuntime {
  readonly queue = new SessionQueue();
  llm: LlmStatus;
  private sdk: SdkAgentPool | null = null;

  constructor(private readonly cfg: BridgeConfig) {
    if (cfg.driver === 'sdk') {
      this.sdk = new SdkAgentPool(cfg);
      this.llm = 'warming';
    } else {
      this.llm = 'n/a';
    }
  }

  get busyCount(): number {
    return this.queue.busyCount;
  }

  async start(): Promise<void> {
    if (!this.sdk) {
      this.llm = 'n/a';
      return;
    }
    this.llm = 'warming';
    try {
      await this.sdk.warmup();
      this.llm = 'ready';
      console.info('[bridge] llm ready (warm Agent.create)');
    } catch (err) {
      this.llm = 'error';
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bridge] llm warmup failed: ${message}`);
    }
  }

  async shutdown(): Promise<void> {
    await this.sdk?.close();
  }

  async handleQueued(body: AgentWebhookBody): Promise<void> {
    await this.queue.run(body.sessionId, () => this.handleOrRecover(body));
  }

  private async handleOrRecover(body: AgentWebhookBody): Promise<void> {
    try {
      await this.handle(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[bridge] job failed: ${message}`);
      if (this.cfg.driver === 'forward') return;
      try {
        const current = currentDetailFromBody(body);
        const errBoard = errorEnrichManifest(body, message);
        const manifest =
          body.command.trim() === '/prompt' && current
            ? mergeDetailChunks(current, {
                ...errBoard,
                layout: {
                  direction: 'vertical',
                  chunks: [
                    {
                      widgetId: 'w_prompt_error',
                      type: 'Paragraph',
                      size: 5,
                      props: {
                        title: 'prompt error',
                        text: message.slice(0, 2000),
                        style: 'red',
                      },
                    },
                  ],
                },
              })
            : errBoard;
        await this.callback(body, manifest);
      } catch (cbErr) {
        const cb = cbErr instanceof Error ? cbErr.message : String(cbErr);
        console.error(`[bridge] error callback failed: ${cb}`);
      }
    }
  }

  async handle(body: AgentWebhookBody): Promise<void> {
    const started = Date.now();
    const cmd = body.command.trim();
    console.info(
      `[bridge] job start session=${body.sessionId} cmd=${cmd} task=${body.taskId} driver=${this.cfg.driver}`,
    );

    if (!isKnownCommand(cmd)) {
      throw new Error(
        `unknown command: ${cmd} (known: ${COMMAND_HANDLERS.join(', ')})`,
      );
    }

    const result =
      cmd === '/prompt' ? await this.runPrompt(body) : await this.runDetails(body);
    if (result.kind === 'peer_callback') {
      console.info(
        `[bridge] forward async — peer owns callback session=${body.sessionId} ms=${Date.now() - started}`,
      );
      return;
    }
    await this.callback(body, result.manifest);
    console.info(
      `[bridge] job ok session=${body.sessionId} task=${result.manifest.taskId} ms=${Date.now() - started}`,
    );
  }

  private async runDetails(body: AgentWebhookBody): Promise<JobResult> {
    if (this.cfg.driver === 'stub' || this.llm === 'error') {
      return { kind: 'manifest', manifest: stubEnrichManifest(body) };
    }

    if (this.cfg.driver === 'forward') {
      const fwd = await runForwardDriver(body, this.cfg);
      if (fwd.asyncHandled) {
        return { kind: 'peer_callback' };
      }
      return {
        kind: 'manifest',
        manifest: normalizeDetailManifest(fwd.text!, body.taskId),
      };
    }

    const text = await this.runLlm(body, buildEnrichPrompt(body));
    return {
      kind: 'manifest',
      manifest: normalizeDetailManifest(text, body.taskId),
    };
  }

  private async runPrompt(body: AgentWebhookBody): Promise<JobResult> {
    const current = currentDetailFromBody(body);
    if (this.cfg.driver === 'stub' || this.llm === 'error') {
      return {
        kind: 'manifest',
        manifest: mergeDetailChunks(current, stubPromptPatch(body)),
      };
    }

    if (this.cfg.driver === 'forward') {
      const fwd = await runForwardDriver(body, this.cfg);
      if (fwd.asyncHandled) {
        return { kind: 'peer_callback' };
      }
      const patch = normalizePatchManifest(fwd.text!, body.taskId);
      return {
        kind: 'manifest',
        manifest: mergeDetailChunks(current, patch),
      };
    }

    const text = await this.runLlm(body, buildPromptFollowUp(body));
    const patch = normalizePatchManifest(text, body.taskId);
    return {
      kind: 'manifest',
      manifest: mergeDetailChunks(current, patch),
    };
  }

  private async runLlm(body: AgentWebhookBody, prompt: string): Promise<string> {
    if (this.cfg.driver === 'exec') {
      return runExecDriver(
        { ...body, systemPrompt: body.systemPrompt || prompt },
        this.cfg,
      );
    }
    if (this.cfg.driver === 'sdk') {
      if (!this.sdk) this.sdk = new SdkAgentPool(this.cfg);
      return this.sdk.send(body.sessionId, prompt);
    }
    return runAgentCli(prompt, this.cfg);
  }

  private async callback(body: AgentWebhookBody, manifest: TuiManifest): Promise<void> {
    const posted = await postManifestCallback({
      manifestUrl: body.callback.manifestUrl,
      sessionId: body.callback.sessionId,
      manifest,
      apiKey: this.cfg.apiKeyHeader,
    });
    if (!posted.ok) {
      throw new Error(
        `callback HTTP ${posted.status}: ${JSON.stringify(posted.body)}`,
      );
    }
  }
}
