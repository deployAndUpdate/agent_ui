import { describe, expect, it } from 'vitest';
import { readConfig, resolveDriver } from '../src/config.js';

describe('resolveDriver', () => {
  it('auto + api key → sdk (not cursor CLI)', () => {
    expect(
      resolveDriver('auto', {
        apiKey: true,
        execCommandSet: true,
        forward: false,
      }),
    ).toBe('sdk');
  });

  it('auto without key or command → stub', () => {
    expect(
      resolveDriver('auto', {
        apiKey: false,
        execCommandSet: false,
        forward: false,
      }),
    ).toBe('stub');
  });

  it('auto + explicit command (no key) → exec', () => {
    expect(
      resolveDriver(undefined, {
        apiKey: false,
        execCommandSet: true,
        forward: false,
      }),
    ).toBe('exec');
  });

  it('auto + forward url (no key) → forward', () => {
    expect(
      resolveDriver('', {
        apiKey: false,
        execCommandSet: false,
        forward: true,
      }),
    ).toBe('forward');
  });

  it('explicit driver wins', () => {
    expect(
      resolveDriver('stub', {
        apiKey: true,
        execCommandSet: true,
        forward: true,
      }),
    ).toBe('stub');
  });
});

describe('readConfig', () => {
  it('defaults driver auto → stub without key', () => {
    const cfg = readConfig({
      TUI_BRIDGE_DRIVER: 'auto',
      TUI_BRIDGE_COMMAND: '',
      CURSOR_API_KEY: '',
      TUI_BRIDGE_FORWARD_URL: '',
    });
    expect(cfg.driver).toBe('stub');
  });

  it('CURSOR_API_KEY selects sdk', () => {
    const cfg = readConfig({
      CURSOR_API_KEY: 'cursor_test',
      TUI_BRIDGE_COMMAND: 'node examples/enrich-echo.mjs',
    });
    expect(cfg.driver).toBe('sdk');
    expect(cfg.apiKey).toBe('cursor_test');
  });

  it('health-related bind defaults', () => {
    const cfg = readConfig({});
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(9090);
    expect(cfg.path).toBe('/agent');
    expect(cfg.jsonRetries).toBe(3);
  });

  it('TUI_BRIDGE_JSON_RETRIES is clamped', () => {
    expect(readConfig({ TUI_BRIDGE_JSON_RETRIES: '9' }).jsonRetries).toBe(5);
  });
});
