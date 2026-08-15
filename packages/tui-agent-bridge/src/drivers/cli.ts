import { spawn } from 'node:child_process';
import type { BridgeConfig } from '../types.js';

export async function runAgentCli(
  prompt: string,
  cfg: BridgeConfig,
): Promise<string> {
  const args = [
    '--print',
    '--mode',
    'ask',
    '--trust',
    '--workspace',
    cfg.workspace,
    '--output-format',
    'text',
  ];
  if (cfg.apiKey) {
    args.push('--api-key', cfg.apiKey);
  }
  if (cfg.model) {
    args.push('--model', cfg.model);
  }
  args.push(prompt);

  return await new Promise((resolve, reject) => {
    const child = spawn(cfg.agentBin, args, {
      cwd: cfg.workspace,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `agent CLI exited ${code}: ${stderr.trim() || stdout.trim() || 'no output'}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });
  });
}
