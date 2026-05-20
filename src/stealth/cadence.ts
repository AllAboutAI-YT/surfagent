/**
 * Click / keystroke / mouse-trajectory cadence — the second leg of the stealth layer.
 *
 * sleepJitter: every CDP-driven click and keystroke sleeps a uniform-random interval
 * before issuing. Default click range 80-400 ms (override SURFAGENT_CLICK_JITTER_MS).
 * Default keystroke range 30-120 ms (override SURFAGENT_TYPE_JITTER_MS).
 *
 * humanMouseTo: opt-in Bezier-curve mousemove path with overshoot+return. Adds ~250 ms
 * latency, only meaningful against detectors that inspect mousemove streams (Tier-2.5+).
 */

function parseRange(env: string | undefined, fallback: [number, number]): [number, number] {
  if (!env) return fallback;
  const parts = env.split(',').map(Number);
  if (parts.length !== 2) return fallback;
  const [min, max] = parts;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0 || min > max) return fallback;
  return [min, max];
}

export async function sleepJitter(
  rangeEnv: string = 'SURFAGENT_CLICK_JITTER_MS',
  fallback: [number, number] = [80, 400]
): Promise<void> {
  const [min, max] = parseRange(process.env[rangeEnv], fallback);
  if (max === 0 && min === 0) return;
  const ms = min + Math.random() * (max - min);
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Dispatch a quadratic-Bezier mousemove path from a randomized start point to (targetX, targetY)
 * via CDP Input.dispatchMouseEvent. Includes a small overshoot + return to avoid dead-center
 * landings.
 *
 * 20-40 frames at 8-25 ms each → ~250 ms total path time. Caller still owns the click itself.
 */
export async function humanMouseTo(
  client: any,
  targetX: number,
  targetY: number
): Promise<void> {
  if (!client || !client.Input || typeof client.Input.dispatchMouseEvent !== 'function') return;
  const { Input } = client;

  // CDP doesn't track cursor position. Start from a randomized point near the target.
  const startX = targetX + (Math.random() - 0.5) * 400;
  const startY = targetY + (Math.random() - 0.5) * 300;
  const ctrlX = (startX + targetX) / 2 + (Math.random() - 0.5) * 200;
  const ctrlY = (startY + targetY) / 2 + (Math.random() - 0.5) * 200;
  const steps = 20 + Math.floor(Math.random() * 20); // 20-40 frames

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * startX + 2 * (1 - t) * t * ctrlX + t ** 2 * targetX;
    const y = (1 - t) ** 2 * startY + 2 * (1 - t) * t * ctrlY + t ** 2 * targetY;
    try {
      await Input.dispatchMouseEvent({ type: 'mouseMoved', x, y, button: 'none' });
    } catch {
      return; // CDP closed mid-path — bail
    }
    await new Promise(r => setTimeout(r, 8 + Math.random() * 17));
  }

  // Small overshoot + return — humans rarely land dead-center on the first try.
  try {
    await Input.dispatchMouseEvent({
      type: 'mouseMoved',
      x: targetX + (Math.random() - 0.5) * 6,
      y: targetY + (Math.random() - 0.5) * 6,
      button: 'none',
    });
    await new Promise(r => setTimeout(r, 40 + Math.random() * 60));
    await Input.dispatchMouseEvent({ type: 'mouseMoved', x: targetX, y: targetY, button: 'none' });
  } catch {
    /* best effort */
  }
}
