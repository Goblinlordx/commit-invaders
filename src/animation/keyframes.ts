/**
 * Shared CSS @keyframes patterns.
 *
 * Each function generates a @keyframes rule string parameterized by
 * CSS custom properties. Per-entity instances set these properties
 * via inline style attributes.
 *
 * Convention: keyframe names use the pattern `{type}-{id}` for
 * per-instance animations or just `{type}` for shared ones.
 */

// ── Oscillation (formation zigzag) ──

/**
 * Generate a formation oscillation @keyframes from direction change points.
 *
 * @param name - Unique keyframe name (e.g., "osc-formation-0")
 * @param points - Array of {percent, x, y} breakpoints from inflection data
 *   percent: 0-100 position in the total animation
 *   x, y: formation offset at that breakpoint (screen coords)
 */
export function oscillationKeyframes(
  name: string,
  points: Array<{ percent: number; x: number; y: number }>,
): string {
  if (points.length === 0) return ''

  const stops = points
    .map((p) => `  ${p.percent.toFixed(2)}% { transform: translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px); }`)
    .join('\n')

  return `@keyframes ${name} {\n${stops}\n}`
}

// ── Travel (cell grid → formation position) ──

/**
 * Generate a travel @keyframes for a lifecycle cell moving from grid to formation.
 * Interpolates position and size.
 *
 * Uses CSS custom properties set per-instance:
 *   --start-x, --start-y: grid screen position (top-left)
 *   --end-x, --end-y: formation screen position (centered)
 *   --start-size: cellSize
 *   --end-size: invaderSize
 */
export function travelKeyframes(name: string): string {
  return `@keyframes ${name} {
  0% {
    transform: translate(var(--start-x), var(--start-y));
    width: var(--start-size);
    height: var(--start-size);
  }
  100% {
    transform: translate(var(--end-x), var(--end-y));
    width: var(--end-size);
    height: var(--end-size);
  }
}`
}

// ── Fade ──

/**
 * Generate a fade @keyframes (opacity transition).
 *
 * @param name - Keyframe name
 * @param from - Starting opacity (0-1)
 * @param to - Ending opacity (0-1)
 */
export function fadeKeyframes(
  name: string,
  from: number,
  to: number,
): string {
  return `@keyframes ${name} {
  0% { opacity: ${from}; }
  100% { opacity: ${to}; }
}`
}

// ── Constant Velocity (laser linear movement) ──

/**
 * Generate a constant-velocity @keyframes for laser travel.
 * Laser moves linearly from spawn position to out-of-bounds.
 *
 * Uses CSS custom properties:
 *   --laser-start-x: screen X at spawn
 *   --laser-end-x: screen X at despawn (far edge)
 */
export function constantVelocityKeyframes(name: string): string {
  return `@keyframes ${name} {
  0% { transform: translateX(0); }
  100% { transform: translateX(var(--laser-travel)); }
}`
}

// ── Wiggle (per-character vertical sine wave) ──

/**
 * Generate a wiggle @keyframes for score/NHS text characters.
 * Simple vertical oscillation.
 *
 * @param name - Keyframe name
 * @param amplitude - Max vertical displacement in px
 */
export function wiggleKeyframes(name: string, amplitude: number): string {
  return `@keyframes ${name} {
  0% { transform: translateY(0); }
  25% { transform: translateY(${-amplitude}px); }
  50% { transform: translateY(0); }
  75% { transform: translateY(${amplitude}px); }
  100% { transform: translateY(0); }
}`
}

// ── Multi-stop opacity (overlay phase transitions) ──

/**
 * Generate a multi-stop opacity @keyframes from phase boundary data.
 *
 * @param name - Keyframe name
 * @param stops - Array of {percent, opacity} breakpoints
 */
export function opacityKeyframes(
  name: string,
  stops: Array<{ percent: number; opacity: number }>,
): string {
  if (stops.length === 0) return ''

  const lines = stops
    .map((s) => `  ${s.percent.toFixed(2)}% { opacity: ${s.opacity.toFixed(3)}; }`)
    .join('\n')

  return `@keyframes ${name} {\n${lines}\n}`
}

// ── Shared keyframe definitions (reusable across all instances) ──

export function sharedKeyframes(): string {
  return [
    fadeKeyframes('fade-in', 0, 1),
    fadeKeyframes('fade-out', 1, 0),
    travelKeyframes('cell-travel'),
    constantVelocityKeyframes('laser-travel'),
    wiggleKeyframes('wiggle-score', 3),
    wiggleKeyframes('wiggle-nhs', 2),
  ].join('\n\n')
}
