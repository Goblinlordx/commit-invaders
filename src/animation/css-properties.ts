/**
 * CSS custom property helpers for per-entity animation parameters.
 *
 * Each entity instance sets inline style properties that drive the
 * shared @keyframes animations.
 */

/**
 * Build a CSS custom properties style string from key-value pairs.
 */
export function cssProps(props: Record<string, string | number>): string {
  return Object.entries(props)
    .map(([k, v]) => `${k}: ${typeof v === 'number' ? v + 'px' : v}`)
    .join('; ')
}

/**
 * CSS properties for a traveling lifecycle cell.
 */
export function travelProps(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  startSize: number,
  endSize: number,
  delay: number,
  duration: number,
): string {
  return cssProps({
    '--start-x': startX,
    '--start-y': startY,
    '--end-x': endX,
    '--end-y': endY,
    '--start-size': startSize,
    '--end-size': endSize,
    'animation-name': 'cell-travel',
    'animation-delay': `${delay}s`,
    'animation-duration': `${duration}s`,
    'animation-fill-mode': 'both',
    'animation-timing-function': 'linear',
  })
}

/**
 * CSS properties for a laser.
 */
export function laserProps(travelDistance: number, delay: number, duration: number): string {
  return cssProps({
    '--laser-travel': travelDistance,
    'animation-name': 'laser-travel',
    'animation-delay': `${delay}s`,
    'animation-duration': `${duration}s`,
    'animation-fill-mode': 'forwards',
    'animation-timing-function': 'linear',
  })
}

/**
 * CSS properties for a fade animation.
 */
export function fadeProps(name: 'fade-in' | 'fade-out', delay: number, duration: number): string {
  return cssProps({
    'animation-name': name,
    'animation-delay': `${delay}s`,
    'animation-duration': `${duration}s`,
    'animation-fill-mode': 'both',
    'animation-timing-function': 'linear',
  })
}

/**
 * CSS properties for a wiggle animation.
 */
export function wiggleProps(
  name: 'wiggle-score' | 'wiggle-nhs',
  delay: number,
  phaseOffset: number,
): string {
  return cssProps({
    'animation-name': name,
    'animation-delay': `${delay - phaseOffset}s`,
    'animation-duration': '0.8s',
    'animation-iteration-count': 'infinite',
    'animation-timing-function': 'ease-in-out',
  })
}

/**
 * CSS properties for a formation oscillation animation.
 */
export function oscillationProps(keyframeName: string, duration: number): string {
  return cssProps({
    'animation-name': keyframeName,
    'animation-duration': `${duration}s`,
    'animation-fill-mode': 'both',
    'animation-timing-function': 'linear',
  })
}
