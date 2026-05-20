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
export declare function sleepJitter(rangeEnv?: string, fallback?: [number, number]): Promise<void>;
/**
 * Dispatch a quadratic-Bezier mousemove path from a randomized start point to (targetX, targetY)
 * via CDP Input.dispatchMouseEvent. Includes a small overshoot + return to avoid dead-center
 * landings.
 *
 * 20-40 frames at 8-25 ms each → ~250 ms total path time. Caller still owns the click itself.
 */
export declare function humanMouseTo(client: any, targetX: number, targetY: number): Promise<void>;
