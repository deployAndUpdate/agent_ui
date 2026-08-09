import type { DashboardManifest, WidgetInteractionEvent } from '@visual-engine/shared';

export interface DashboardSnapshotDto {
  sessionId: string;
  version: number;
  manifest: DashboardManifest;
  updatedAt: string;
}

function authHeaders(apiKey?: string): HeadersInit {
  return apiKey ? { 'X-API-Key': apiKey } : {};
}

export async function fetchDashboard(
  sessionId: string,
  apiBase = '',
  apiKey?: string,
): Promise<DashboardSnapshotDto | null> {
  const res = await fetch(`${apiBase}/api/dashboard/${encodeURIComponent(sessionId)}`, {
    headers: { ...authHeaders(apiKey) },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`fetchDashboard failed: ${res.status}`);
  }
  return (await res.json()) as DashboardSnapshotDto;
}

export async function postWidgetInteraction(
  event: WidgetInteractionEvent,
  apiBase = '',
  apiKey?: string,
): Promise<void> {
  const res = await fetch(`${apiBase}/api/widget-interaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(apiKey),
    },
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    throw new Error(`postWidgetInteraction failed: ${res.status}`);
  }
}

export interface DashboardUpdateMessage {
  type: 'dashboard_update';
  sessionId: string;
  version: number;
  manifest: DashboardManifest;
}
