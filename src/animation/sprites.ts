/**
 * SVG sprite definitions for styled render mode.
 *
 * All sprites are defined as SVG <symbol> elements within a <defs> block.
 * Each sprite is centered on (0,0) and sized to fit the entity's AABB.
 * The compositor uses <use href="#sprite-id"> to reference them.
 *
 * Invaders are rotated 90° CW to face left (toward the ship) in the
 * horizontal layout. Colors contrast with the dark green grid background
 * using reds, magentas, and warm tones.
 */

// ── Ship Sprite ──
// Top-down spaceship pointing right, pixel-art style, fits size×size AABB
function shipSymbol(size: number): string {
  const h = size / 2
  return `<symbol id="sprite-ship" viewBox="${-h} ${-h} ${size} ${size}">
  <!-- Fuselage -->
  <rect x="${-h * 0.3}" y="${-h * 0.45}" width="${h * 1.1}" height="${h * 0.9}" fill="#4488ff" />
  <!-- Nose cone -->
  <polygon points="${h * 0.8},0 ${h * 0.2},${-h * 0.45} ${h * 0.2},${h * 0.45}" fill="#5599ff" />
  <!-- Cockpit -->
  <rect x="${h * 0.1}" y="${-h * 0.2}" width="${h * 0.35}" height="${h * 0.4}" fill="#aaddff" rx="0.5" />
  <!-- Upper wing -->
  <polygon points="${-h * 0.5},${-h * 0.45} ${-h},${-h} ${-h * 0.1},${-h * 0.45}" fill="#3377dd" />
  <!-- Lower wing -->
  <polygon points="${-h * 0.5},${h * 0.45} ${-h},${h} ${-h * 0.1},${h * 0.45}" fill="#3377dd" />
  <!-- Engine ports -->
  <rect x="${-h}" y="${-h * 0.55}" width="${h * 0.25}" height="${h * 0.25}" fill="#88ccff" opacity="0.8" />
  <rect x="${-h}" y="${h * 0.3}" width="${h * 0.25}" height="${h * 0.25}" fill="#88ccff" opacity="0.8" />
  <!-- Engine glow -->
  <rect x="${-h * 1.05}" y="${-h * 0.3}" width="${h * 0.3}" height="${h * 0.15}" fill="#aaeeff" opacity="0.5" />
  <rect x="${-h * 1.05}" y="${h * 0.15}" width="${h * 0.3}" height="${h * 0.15}" fill="#aaeeff" opacity="0.5" />
</symbol>`
}

// ── Invader Sprites ──
// 4 variants by contribution level. Colors: warm tones that contrast
// with the dark green grid. Each is drawn facing DOWN then the symbol
// has a 90° CW rotation applied so they face LEFT in the horizontal layout.

// Level 1 (lightest commits): simple squid shape, pink
function invaderSymbolL1(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-1" viewBox="${-h} ${-h} ${size} ${size}">
  <g transform="rotate(90)">
    <rect x="${-p * 1.5}" y="${-h + p}" width="${p * 3}" height="${p}" fill="#e06080" />
    <rect x="${-h + p}" y="${-h + p * 2}" width="${p * 7}" height="${p * 2}" fill="#e06080" />
    <rect x="${-h}" y="${-h + p * 4}" width="${size}" height="${p * 2}" fill="#ff7799" />
    <rect x="${-h + p}" y="${-h + p * 6}" width="${p * 2}" height="${p * 2}" fill="#e06080" />
    <rect x="${h - p * 3}" y="${-h + p * 6}" width="${p * 2}" height="${p * 2}" fill="#e06080" />
  </g>
</symbol>`
}

// Level 2: crab shape, orange-red
function invaderSymbolL2(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-2" viewBox="${-h} ${-h} ${size} ${size}">
  <g transform="rotate(90)">
    <rect x="${-h + p}" y="${-h}" width="${p * 2}" height="${p}" fill="#dd5533" />
    <rect x="${h - p * 3}" y="${-h}" width="${p * 2}" height="${p}" fill="#dd5533" />
    <rect x="${-h}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#dd5533" />
    <rect x="${h - p * 3}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#dd5533" />
    <rect x="${-h + p}" y="${-h + p * 3}" width="${p * 7}" height="${p * 3}" fill="#ff6644" />
    <rect x="${-h}" y="${-h + p * 6}" width="${size}" height="${p}" fill="#dd5533" />
    <rect x="${-h}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#ff6644" />
    <rect x="${h - p * 2}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#ff6644" />
  </g>
</symbol>`
}

// Level 3: classic invader, magenta/purple
function invaderSymbolL3(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-3" viewBox="${-h} ${-h} ${size} ${size}">
  <g transform="rotate(90)">
    <rect x="${-h + p * 2}" y="${-h}" width="${p * 5}" height="${p}" fill="#bb44cc" />
    <rect x="${-h}" y="${-h + p}" width="${size}" height="${p * 2}" fill="#cc55dd" />
    <rect x="${-h}" y="${-h + p * 3}" width="${p * 2}" height="${p * 2}" fill="#bb44cc" />
    <rect x="${-h + p * 3}" y="${-h + p * 3}" width="${p * 3}" height="${p * 2}" fill="#dd66ee" />
    <rect x="${h - p * 2}" y="${-h + p * 3}" width="${p * 2}" height="${p * 2}" fill="#bb44cc" />
    <rect x="${-h + p}" y="${-h + p * 5}" width="${p * 2}" height="${p * 2}" fill="#cc55dd" />
    <rect x="${h - p * 3}" y="${-h + p * 5}" width="${p * 2}" height="${p * 2}" fill="#cc55dd" />
    <rect x="${-h + p * 2}" y="${-h + p * 7}" width="${p}" height="${p * 2}" fill="#bb44cc" />
    <rect x="${h - p * 3}" y="${-h + p * 7}" width="${p}" height="${p * 2}" fill="#bb44cc" />
  </g>
</symbol>`
}

// Level 4 (most commits): menacing skull, bright red/white
function invaderSymbolL4(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-4" viewBox="${-h} ${-h} ${size} ${size}">
  <g transform="rotate(90)">
    <rect x="${-h + p}" y="${-h}" width="${p}" height="${p}" fill="#ff3333" />
    <rect x="${h - p * 2}" y="${-h}" width="${p}" height="${p}" fill="#ff3333" />
    <rect x="${-h}" y="${-h + p}" width="${p * 3}" height="${p}" fill="#ff3333" />
    <rect x="${h - p * 3}" y="${-h + p}" width="${p * 3}" height="${p}" fill="#ff3333" />
    <rect x="${-h}" y="${-h + p * 2}" width="${size}" height="${p * 2}" fill="#ff4444" />
    <rect x="${-h + p}" y="${-h + p * 4}" width="${p * 7}" height="${p * 2}" fill="#ff5555" />
    <rect x="${-h + p * 2}" y="${-h + p * 3}" width="${p}" height="${p}" fill="#ffffff" opacity="0.9" />
    <rect x="${h - p * 3}" y="${-h + p * 3}" width="${p}" height="${p}" fill="#ffffff" opacity="0.9" />
    <rect x="${-h}" y="${-h + p * 6}" width="${p * 2}" height="${p}" fill="#ff3333" />
    <rect x="${-h + p * 3}" y="${-h + p * 6}" width="${p * 3}" height="${p}" fill="#ff4444" />
    <rect x="${h - p * 2}" y="${-h + p * 6}" width="${p * 2}" height="${p}" fill="#ff3333" />
    <rect x="${-h + p}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#ff3333" />
    <rect x="${h - p * 3}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#ff3333" />
  </g>
</symbol>`
}

// ── Laser Sprite ──
// Glowing projectile, fits laserWidth×laserWidth AABB
function laserSymbol(width: number): string {
  const h = width / 2
  return `<symbol id="sprite-laser" viewBox="${-h} ${-h} ${width} ${width}">
  <rect x="${-h}" y="${-h * 0.5}" width="${width}" height="${width * 0.5}" fill="#ffff00" rx="1" />
  <rect x="${-h * 0.6}" y="${-h * 0.3}" width="${width * 0.6}" height="${width * 0.3}" fill="#ffffaa" />
</symbol>`
}

// ── Explosion Effect ──
// Cross-burst pattern, animated via CSS scale+fade with transform-origin: center
function explosionSymbol(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-explosion" viewBox="${-h} ${-h} ${size} ${size}">
  <rect x="${-p}" y="${-h}" width="${p * 2}" height="${size}" fill="#ff6644" />
  <rect x="${-h}" y="${-p}" width="${size}" height="${p * 2}" fill="#ff6644" />
  <rect x="${-h + p}" y="${-h + p}" width="${p * 2}" height="${p * 2}" fill="#ffaa44" />
  <rect x="${h - p * 3}" y="${-h + p}" width="${p * 2}" height="${p * 2}" fill="#ffaa44" />
  <rect x="${-h + p}" y="${h - p * 3}" width="${p * 2}" height="${p * 2}" fill="#ffaa44" />
  <rect x="${h - p * 3}" y="${h - p * 3}" width="${p * 2}" height="${p * 2}" fill="#ffaa44" />
</symbol>`
}

// ── Public API ──

export type RenderMode = 'hitbox' | 'styled'

/**
 * Generate the <defs> block with all sprite symbols.
 * Only included when renderMode is 'styled'.
 */
export function spriteDefs(invaderSize: number, laserWidth: number): string {
  return `<defs>
${shipSymbol(invaderSize)}
${invaderSymbolL1(invaderSize)}
${invaderSymbolL2(invaderSize)}
${invaderSymbolL3(invaderSize)}
${invaderSymbolL4(invaderSize)}
${laserSymbol(laserWidth)}
${explosionSymbol(invaderSize)}
</defs>`
}

/**
 * Get the sprite symbol ID for an invader based on contribution level.
 */
export function invaderSpriteId(level: number): string {
  const clamped = Math.max(1, Math.min(4, level))
  return `sprite-invader-${clamped}`
}

/**
 * Explosion CSS keyframe — scale up and fade out.
 * Uses transform-box: fill-box + transform-origin: center to ensure
 * the explosion scales from its center position, not the SVG origin.
 */
export function explosionKeyframes(): string {
  return `@keyframes explode {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.8); opacity: 0.7; }
  100% { transform: scale(2.5); opacity: 0; }
}`
}

/**
 * CSS class for explosion elements to ensure centered scaling.
 */
export function explosionCss(): string {
  return `.explosion { transform-box: fill-box; transform-origin: center; }`
}
