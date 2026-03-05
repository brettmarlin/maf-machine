import type { Env } from '../index';

/**
 * Mark an athlete as deauthorized by writing a timestamped key to KV.
 * Actual data deletion happens later via the scheduled cron job.
 */
export async function handleDeauthorization(athleteId: string, env: Env): Promise<void> {
  console.log(`[deauth] Marking athlete ${athleteId} for cleanup`);
  await env.MAF_ACTIVITIES.put(`deauth:${athleteId}`, String(Date.now()));
}

/**
 * Cron handler: find all deauth:{athleteId} keys older than 30 days
 * and delete all KV data for those athletes.
 */
export async function handleScheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  console.log('[cron] Scheduled deauth cleanup triggered');

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const list = await env.MAF_ACTIVITIES.list({ prefix: 'deauth:' });

  for (const key of list.keys) {
    const raw = await env.MAF_ACTIVITIES.get(key.name);
    if (!raw) continue;

    const timestamp = Number(raw);
    if (now - timestamp < thirtyDaysMs) continue;

    const athleteId = key.name.replace('deauth:', '');
    console.log(`[cron] Deleting data for deauthorized athlete ${athleteId}`);

    await Promise.all([
      env.MAF_ACTIVITIES.delete(athleteId),
      env.MAF_SETTINGS.delete(`${athleteId}:settings`),
      env.MAF_TOKENS.delete(athleteId),
      env.MAF_GAME.delete(`${athleteId}:game`),
      env.MAF_ACTIVITIES.delete(key.name), // remove the deauth marker
    ]);
  }
}
