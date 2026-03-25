/**
 * SVG sprite definitions for styled render mode.
 *
 * All sprites are defined as SVG <symbol> elements within a <defs> block.
 * Each sprite is centered on (0,0) and sized to fit the entity's AABB.
 * The compositor uses <use href="#sprite-id"> to reference them.
 */

// ── Ship Sprite ──
// Arrow/chevron shape pointing right (direction of fire), fits 9×9 AABB
function shipSymbol(size: number): string {
  const h = size / 2
  // Stylized ship: pointed right with wings
  return `<symbol id="sprite-ship" viewBox="${-h} ${-h} ${size} ${size}">
  <polygon points="${h},0 ${-h},${-h} ${-h * 0.3},0 ${-h},${h}" fill="#4488ff" />
  <polygon points="${h * 0.2},0 ${-h * 0.5},${-h * 0.4} ${-h * 0.5},${h * 0.4}" fill="#66aaff" />
  <rect x="${-h}" y="${-1}" width="${h * 0.4}" height="2" fill="#88ccff" opacity="0.6" />
</symbol>`
}

// ── Invader Sprites ──
// 4 variants by contribution level, each fits 9×9 AABB
// Level 1: simple, level 4: complex/menacing

function invaderSymbolL1(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1 // pixel unit
  return `<symbol id="sprite-invader-1" viewBox="${-h} ${-h} ${size} ${size}">
  <rect x="${-h}" y="${-h}" width="${size}" height="${size}" fill="none" />
  <rect x="${-h + p}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#0e4429" />
  <rect x="${h - p * 4}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#0e4429" />
  <rect x="${-h + p * 2}" y="${-h + p * 2}" width="${p * 5}" height="${p * 3}" fill="#0e4429" />
  <rect x="${-h}" y="${-h + p * 4}" width="${size}" height="${p * 2}" fill="#0e4429" />
  <rect x="${-h + p}" y="${-h + p * 6}" width="${p * 2}" height="${p * 2}" fill="#0e4429" />
  <rect x="${h - p * 3}" y="${-h + p * 6}" width="${p * 2}" height="${p * 2}" fill="#0e4429" />
</symbol>`
}

function invaderSymbolL2(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-2" viewBox="${-h} ${-h} ${size} ${size}">
  <rect x="${-h}" y="${-h}" width="${size}" height="${size}" fill="none" />
  <rect x="${-h + p}" y="${-h}" width="${p * 2}" height="${p}" fill="#006d32" />
  <rect x="${h - p * 3}" y="${-h}" width="${p * 2}" height="${p}" fill="#006d32" />
  <rect x="${-h}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#006d32" />
  <rect x="${h - p * 3}" y="${-h + p}" width="${p * 3}" height="${p * 2}" fill="#006d32" />
  <rect x="${-h + p}" y="${-h + p * 3}" width="${p * 7}" height="${p * 3}" fill="#006d32" />
  <rect x="${-h}" y="${-h + p * 5}" width="${size}" height="${p * 2}" fill="#006d32" />
  <rect x="${-h}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#006d32" />
  <rect x="${h - p * 2}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#006d32" />
</symbol>`
}

function invaderSymbolL3(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-3" viewBox="${-h} ${-h} ${size} ${size}">
  <rect x="${-h}" y="${-h}" width="${size}" height="${size}" fill="none" />
  <rect x="${-h + p * 2}" y="${-h}" width="${p * 5}" height="${p}" fill="#26a641" />
  <rect x="${-h}" y="${-h + p}" width="${size}" height="${p * 2}" fill="#26a641" />
  <rect x="${-h}" y="${-h + p * 3}" width="${p * 2}" height="${p * 2}" fill="#26a641" />
  <rect x="${-h + p * 3}" y="${-h + p * 3}" width="${p * 3}" height="${p * 2}" fill="#26a641" />
  <rect x="${h - p * 2}" y="${-h + p * 3}" width="${p * 2}" height="${p * 2}" fill="#26a641" />
  <rect x="${-h + p}" y="${-h + p * 5}" width="${p * 2}" height="${p * 2}" fill="#26a641" />
  <rect x="${h - p * 3}" y="${-h + p * 5}" width="${p * 2}" height="${p * 2}" fill="#26a641" />
  <rect x="${-h + p * 2}" y="${-h + p * 7}" width="${p}" height="${p * 2}" fill="#26a641" />
  <rect x="${h - p * 3}" y="${-h + p * 7}" width="${p}" height="${p * 2}" fill="#26a641" />
</symbol>`
}

function invaderSymbolL4(size: number): string {
  const h = size / 2
  const p = Math.floor(size / 9) || 1
  return `<symbol id="sprite-invader-4" viewBox="${-h} ${-h} ${size} ${size}">
  <rect x="${-h}" y="${-h}" width="${size}" height="${size}" fill="none" />
  <rect x="${-h + p}" y="${-h}" width="${p}" height="${p}" fill="#39d353" />
  <rect x="${h - p * 2}" y="${-h}" width="${p}" height="${p}" fill="#39d353" />
  <rect x="${-h}" y="${-h + p}" width="${p * 3}" height="${p}" fill="#39d353" />
  <rect x="${h - p * 3}" y="${-h + p}" width="${p * 3}" height="${p}" fill="#39d353" />
  <rect x="${-h}" y="${-h + p * 2}" width="${size}" height="${p * 2}" fill="#39d353" />
  <rect x="${-h + p}" y="${-h + p * 4}" width="${p * 7}" height="${p * 2}" fill="#39d353" />
  <rect x="${-h}" y="${-h + p * 6}" width="${p * 2}" height="${p}" fill="#39d353" />
  <rect x="${-h + p * 3}" y="${-h + p * 6}" width="${p * 3}" height="${p}" fill="#39d353" />
  <rect x="${h - p * 2}" y="${-h + p * 6}" width="${p * 2}" height="${p}" fill="#39d353" />
  <rect x="${-h + p}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#39d353" />
  <rect x="${h - p * 3}" y="${-h + p * 7}" width="${p * 2}" height="${p * 2}" fill="#39d353" />
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
// Used via CSS animation: scale up + fade out
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
 * Explosion CSS keyframe — scale up and fade out over ~0.3s.
 * Returns the @keyframes rule string.
 */
export function explosionKeyframes(): string {
  return `@keyframes explode {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.8); opacity: 0.7; }
  100% { transform: scale(2.5); opacity: 0; }
}`
}
