/**
 * SVG entity templates for hitbox mode.
 *
 * Each function returns an SVG element string for one entity instance.
 * Templates use flat colored rects matching the canvas renderer exactly.
 * CSS custom properties parameterize per-instance animation data.
 */

import type { SimConfig, ContributionLevel } from '../types.js'

// ── Colors (must match canvas renderer) ──

export const GRID_COLORS: Record<number, string> = {
  0: '#1a1a2e',
  1: '#0e4429',
  2: '#006d32',
  3: '#26a641',
  4: '#39d353',
}
export const INVADER_COLOR = '#ff4444'
export const LASER_COLOR = '#ffff00'
export const SHIP_COLOR = '#4488ff'
export const BG_COLOR = '#0d1117'
export const PLUCK_COLOR = '#d29922'
export const OVERLAY_COLOR = '#0d1117'

// ── Grid Cell ──

export function gridCellSvg(
  id: string,
  screenX: number,
  screenY: number,
  level: ContributionLevel,
  cellSize: number,
): string {
  const fill = GRID_COLORS[level] ?? GRID_COLORS[0]!
  return `<rect id="${id}" x="${screenX}" y="${screenY}" width="${cellSize}" height="${cellSize}" fill="${fill}" />`
}

// ── Invader ──

export function invaderSvg(
  id: string,
  screenX: number,
  screenY: number,
  size: number,
): string {
  const half = size / 2
  return `<rect id="${id}" class="invader" x="${screenX - half}" y="${screenY - half}" width="${size}" height="${size}" fill="${INVADER_COLOR}" />`
}

// ── Ship ──

export function shipSvg(
  id: string,
  screenX: number,
  screenY: number,
  size: number,
): string {
  const half = size / 2
  return `<rect id="${id}" class="ship" x="${screenX - half}" y="${screenY - half}" width="${size}" height="${size}" fill="${SHIP_COLOR}" />`
}

// ── Laser ──

export function laserSvg(
  id: string,
  screenX: number,
  screenY: number,
  width: number,
): string {
  const half = width / 2
  return `<rect id="${id}" class="laser" x="${screenX - half}" y="${screenY - half}" width="${width}" height="${width}" fill="${LASER_COLOR}" />`
}

// ── Overlay ──

export function overlaySvg(
  id: string,
  width: number,
  height: number,
  opacity: number = 0.6,
): string {
  return `<rect id="${id}" class="overlay" x="0" y="0" width="${width}" height="${height}" fill="${OVERLAY_COLOR}" opacity="${opacity}" />`
}

// ── Blackout Overlay ──

export function blackoutSvg(
  id: string,
  width: number,
  height: number,
): string {
  return `<rect id="${id}" class="blackout" x="0" y="0" width="${width}" height="${height}" fill="#000000" opacity="0" />`
}

// ── Formation Group ──

export function formationGroupSvg(
  id: string,
  children: string,
): string {
  return `<g id="${id}" class="formation">${children}</g>`
}

// ── Lifecycle Cell (plucked/traveling/hatching) ──

export function lifecycleCellSvg(
  id: string,
  screenX: number,
  screenY: number,
  size: number,
  fill: string = PLUCK_COLOR,
): string {
  const half = size / 2
  return `<rect id="${id}" class="lifecycle-cell" x="${screenX - half}" y="${screenY - half}" width="${size}" height="${size}" fill="${fill}" />`
}
