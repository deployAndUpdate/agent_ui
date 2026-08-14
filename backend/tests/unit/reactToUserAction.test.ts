import { describe, expect, it, beforeEach } from 'vitest';
import type { TuiManifest, TuiUserAction } from '@visual-engine/tui-shared';
import { InMemoryTuiStore } from '../../src/tui/store/InMemoryTuiStore.js';
import {
  _resetBoardStackForTests,
  reactToUserAction,
  rememberBoard,
} from '../../src/tui/actions/reactToUserAction.js';
import validTui from '../fixtures/tui-manifest.valid.json';

const board = validTui as TuiManifest;

describe('reactToUserAction', () => {
  let store: InMemoryTuiStore;

  beforeEach(() => {
    store = new InMemoryTuiStore();
    _resetBoardStackForTests();
  });

  it('select_row pushes detail manifest to outbox', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    rememberBoard('s1', board);

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
    expect(snap?.manifest.taskId).toMatch(/^detail_w_results_/);
    expect(snap?.manifest.layout.chunks.some((c) => c.widgetId === 'w_detail_body')).toBe(
      true,
    );
    expect((await store.listPendingOutbox()).length).toBeGreaterThanOrEqual(2);
  });

  it('navigate_back restores board', async () => {
    await store.saveSessionWithOutbox({ sessionId: 's1', manifest: board });
    rememberBoard('s1', board);

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
    expect(snap?.manifest.layout.chunks[1]?.widgetId).toBe('w_results');
  });
});
