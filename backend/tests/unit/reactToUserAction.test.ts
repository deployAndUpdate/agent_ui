import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import { InMemoryTuiStore } from '../../src/tui/store/InMemoryTuiStore.js';
import { reactToUserAction } from '../../src/tui/actions/reactToUserAction.js';
import { postAgentWebhook } from '../../src/tui/actions/agentWebhook.js';
import validTui from '../fixtures/tui-manifest.valid.json';

const board = validTui as TuiManifest;

describe('reactToUserAction', () => {
  let store: InMemoryTuiStore;

  beforeEach(() => {
    store = new InMemoryTuiStore();
  });

  it('select_row pushes ephemeral detail without replacing session board', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });

    const action: TuiUserAction = {
      event: 'USER_ACTION',
      taskId: board.taskId,
      widgetId: 'w_results',
      action: 'select_row',
      payload: { rowIndex: 0, row: ['src/main.rs', '142', '0.98'] },
    };

    const { reacted } = await reactToUserAction({ sessionId: 's1', action, store });
    expect(reacted).toBe(true);

    const snap = await store.getSession('s1');
    expect(snap?.manifest.taskId).toBe(board.taskId);
    expect(snap?.manifest.layout.chunks[1]?.widgetId).toBe('w_results');

    const pending = await store.listPendingOutbox();
    const detailEvent = pending.find((e) => e.payload.taskId.startsWith('detail_'));
    expect(detailEvent).toBeDefined();
    expect(detailEvent?.payload.layout.chunks.some((c) => c.widgetId === 'w_detail_body')).toBe(
      true,
    );
  });

  it('select_point pushes ephemeral detail with unique taskId', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: board.taskId,
        widgetId: 'w_pie',
        action: 'select_point',
        payload: {
          kind: 'pie',
          seriesIndex: 0,
          seriesName: 'share',
          pointIndex: 2,
          label: 'EMEA',
          value: 42,
          percent: 0.31,
        },
      },
      store,
    });
    expect(reacted).toBe(true);
    const snap = await store.getSession('s1');
    expect(snap?.manifest.taskId).toBe(board.taskId);
    const pending = await store.listPendingOutbox();
    const detailEvent = pending.find((e) => e.payload.taskId === 'detail_w_pie_s0_i2');
    expect(detailEvent).toBeDefined();
    expect(detailEvent?.payload.taskId.startsWith('detail_')).toBe(true);
  });

  it('navigate_back re-publishes session board', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });

    await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: board.taskId,
        widgetId: 'w_results',
        action: 'select_row',
        payload: { rowIndex: 1 },
      },
      store,
    });

    const beforeBack = await store.listPendingOutbox();
    const pendingBefore = beforeBack.length;

    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: 'detail_w_results_1',
        widgetId: 'w_results',
        action: 'navigate_back',
        payload: {},
      },
      store,
    });
    expect(reacted).toBe(true);

    const snap = await store.getSession('s1');
    expect(snap?.manifest.taskId).toBe(board.taskId);

    const pending = await store.listPendingOutbox();
    expect(pending.length).toBe(pendingBefore + 1);
    expect(pending[pending.length - 1]?.payload.taskId).toBe(board.taskId);
  });

  it('command /details posts webhook with systemPrompt more details', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });

    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));

    const action: TuiUserAction = {
      event: 'USER_ACTION',
      taskId: 'detail_w_results_0',
      widgetId: 'w_results',
      action: 'command',
      payload: {
        command: '/details',
        systemPrompt: 'more details',
        rowIndex: 0,
      },
    };

    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action,
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        TUI_AGENT_WEBHOOK_URL: 'http://127.0.0.1:9090/agent',
        VISUAL_ENGINE_API: 'http://127.0.0.1:3001',
      } as NodeJS.ProcessEnv,
    });

    expect(reacted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(init?.body));
    expect(body.systemPrompt).toBe('more details');
    expect(body.command).toBe('/details');
    expect(body.callback.manifestUrl).toBe('http://127.0.0.1:3001/api/v1/tui/manifest');
    expect(body.sessionId).toBe('s1');
  });

  it('command /prompt posts webhook with userPrompt as systemPrompt', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: 'detail_w_results_0',
        widgetId: 'w_detail_body',
        action: 'command',
        payload: {
          command: '/prompt',
          userPrompt: 'add a timeline',
          systemPrompt: 'add a timeline',
          focusedWidgetId: 'w_detail_body',
        },
      },
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        TUI_AGENT_WEBHOOK_URL: 'http://127.0.0.1:9090/agent',
        VISUAL_ENGINE_API: 'http://127.0.0.1:3001',
      } as NodeJS.ProcessEnv,
    });
    expect(reacted).toBe(true);
    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body));
    expect(body.command).toBe('/prompt');
    expect(body.systemPrompt).toBe('add a timeline');
  });

  it('command /details without webhook URL does not react', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    const fetchImpl = vi.fn();
    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: 'detail_w_results_0',
        widgetId: 'w_results',
        action: 'command',
        payload: { command: '/details', systemPrompt: 'more details' },
      },
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {} as NodeJS.ProcessEnv,
    });
    expect(reacted).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('command /foo skips webhook', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    const fetchImpl = vi.fn();
    const { reacted } = await reactToUserAction({
      sessionId: 's1',
      action: {
        event: 'USER_ACTION',
        taskId: 'detail_w_results_0',
        widgetId: 'w_results',
        action: 'command',
        payload: { command: '/foo' },
      },
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {
        TUI_AGENT_WEBHOOK_URL: 'http://127.0.0.1:9090/agent',
      } as NodeJS.ProcessEnv,
    });
    expect(reacted).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('postAgentWebhook', () => {
  it('skips when URL unset', async () => {
    const r = await postAgentWebhook({
      sessionId: 's',
      action: {
        event: 'USER_ACTION',
        taskId: 't',
        widgetId: 'w',
        action: 'command',
        payload: { command: '/details', systemPrompt: 'more details' },
      },
      currentManifest: null,
      env: {} as NodeJS.ProcessEnv,
    });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('no_url');
  });
});
