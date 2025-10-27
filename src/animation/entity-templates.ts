/**
 * SVG entity templates for hitbox mode.
 *
 * Each function returns an SVG element string for one entity instance.
 * Templates use flat colored rects matching the canvas renderer exactly.
 * CSS custom properties parameterize per-instance animation data.
 */

import type { SimConfig, ContributionLevel } from '../types.js'

// ── Color Palettes ──

export interface ColorPalette {
  grid: Record<number, string>
  invader: string
  laser: string
  ship: string
  bg: string
  pluck: string
  overlay: string
  text: string
  textMuted: string
  scoreText: string
}

export const PALETTE_DARK: ColorPalette = {
  grid: { 0: '#1a1a2e', 1: '#0e4429', 2: '#006d32', 3: '#26a641', 4: '#39d353' },
  invader: '#ff4444', laser: '#ffff00', ship: '#4488ff',
  bg: '#0d1117', pluck: '#d29922', overlay: '#0d1117',
  text: '#e6edf3', textMuted: '#8b949e', scoreText: '#39d353',
}

export const PALETTE_LIGHT: ColorPalette = {
  grid: { 0: '#ebedf0', 1: '#9be9a8', 2: '#40c463', 3: '#30a14e', 4: '#216e39' },
  invader: '#cf222e', laser: '#bf8700', ship: '#0969da',
  bg: '#ffffff', pluck: '#bf8700', overlay: '#ffffff',
  text: '#1f2328', textMuted: '#656d76', scoreText: '#1a7f37',
}

export const PALETTE_CLASSIC: ColorPalette = {
  grid: { 0: '#0a0a12', 1: '#003311', 2: '#005522', 3: '#1a8833', 4: '#22bb44' },
  invader: '#ff3333', laser: '#33ff33', ship: '#33ff33',
  bg: '#000000', pluck: '#ffaa00', overlay: '#000000',
  text: '#33ff33', textMuted: '#227722', scoreText: '#33ff33',
}

// Default exports for backward compatibility
export const GRID_COLORS = PALETTE_DARK.grid
export const INVADER_COLOR = PALETTE_DARK.invader
export const LASER_COLOR = PALETTE_DARK.laser
export const SHIP_COLOR = PALETTE_DARK.ship
export const BG_COLOR = PALETTE_DARK.bg
export const PLUCK_COLOR = PALETTE_DARK.pluck
export const OVERLAY_COLOR = PALETTE_DARK.overlay

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
