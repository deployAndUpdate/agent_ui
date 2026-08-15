import type { BridgeConfig } from '../types.js';

export async function runAgentSdk(
  prompt: string,
  cfg: BridgeConfig,
): Promise<string> {
  let Agent: typeof import('@cursor/sdk').Agent;
  try {
    ({ Agent } = await import('@cursor/sdk'));
  } catch {
    throw new Error(
      '@cursor/sdk not installed — npm i @cursor/sdk -w @visual-engine/tui-agent-bridge',
    );
  }
  if (!cfg.apiKey) {
    throw new Error('CURSOR_API_KEY required for TUI_BRIDGE_DRIVER=sdk');
  }

  const result = await Agent.prompt(prompt, {
    apiKey: cfg.apiKey,
    model: { id: cfg.model || 'composer-2.5' },
    local: { cwd: cfg.workspace },
  });

  if (result.status === 'error') {
    throw new Error(`Cursor SDK run failed: ${result.id ?? 'unknown'}`);
  }

  const text =
    typeof result.result === 'string'
      ? result.result
      : result.result != null
        ? JSON.stringify(result.result)
        : '';
  if (!text.trim()) {
    throw new Error('Cursor SDK returned empty result');
  }
  return text;
}
