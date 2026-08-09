import { test, expect } from '@playwright/test';

const manifest = {
  taskId: 'e2e_task',
  operation: 'SYNC_DASHBOARD',
  layout: {
    widgets: [
      {
        widgetId: 'w_01',
        type: 'MetricCard',
        size: { w: 4, h: 2 },
        props: { title: 'E2E Users', value: 42 },
      },
    ],
  },
};

test('loads dashboard via API and shows widget', async ({ page, request }) => {
  const sessionId = `e2e_${Date.now()}`;
  const res = await request.post('http://127.0.0.1:3001/api/manifest', {
    data: { sessionId, version: 1, manifest },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto(`/?sessionId=${sessionId}`);
  await expect(page.getByTestId('connection-status')).toHaveText(/live|reconnecting|loading/);
  await expect(page.getByText('E2E Users')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('metric-card').getByText('42')).toBeVisible();
});
