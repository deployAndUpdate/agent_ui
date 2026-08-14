import { describe, expect, it, beforeEach } from 'vitest';
import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import { InMemoryTuiStore } from '../../src/tui/store/InMemoryTuiStore.js';
import { reactToUserAction } from '../../src/tui/actions/reactToUserAction.js';
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
});
