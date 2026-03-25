import {
  gridCellSvg,
  invaderSvg,
  shipSvg,
  laserSvg,
  overlaySvg,
  lifecycleCellSvg,
  formationGroupSvg,
  GRID_COLORS,
  INVADER_COLOR,
  PLUCK_COLOR,
  BG_COLOR,
} from '../../src/animation/entity-templates.js'

import {
  sharedKeyframes,
  oscillationKeyframes,
  fadeKeyframes,
  wiggleKeyframes,
} from '../../src/animation/keyframes.js'

const panelsDiv = document.getElementById('panels')!

interface EntityDemo {
  title: string
  width: number
  height: number
  svgContent: string
  cssContent: string
}

function createPanel(demo: EntityDemo): void {
  const panel = document.createElement('div')
  panel.className = 'panel'

  const svgId = `svg-${demo.title.toLowerCase().replace(/\s+/g, '-')}`

  panel.innerHTML = `
    <h2>${demo.title}</h2>
    <svg id="${svgId}" width="${demo.width}" height="${demo.height}" viewBox="0 0 ${demo.width} ${demo.height}" xmlns="http://www.w3.org/2000/svg">
      <style>${demo.cssContent}</style>
      <rect width="${demo.width}" height="${demo.height}" fill="${BG_COLOR}" />
      ${demo.svgContent}
    </svg>
    <div class="controls">
      <button data-action="restart">|&lt;</button>
      <button data-action="toggle">Play</button>
      <label>Speed: <input type="range" min="0.1" max="3" step="0.1" value="1" data-action="speed" /></label>
    </div>
  `

  const svg = panel.querySelector('svg')!
  const toggleBtn = panel.querySelector('[data-action="toggle"]') as HTMLButtonElement
  const speedInput = panel.querySelector('[data-action="speed"]') as HTMLInputElement
  let playing = true

  toggleBtn.addEventListener('click', () => {
    playing = !playing
    toggleBtn.textContent = playing ? 'Pause' : 'Play'
    svg.style.animationPlayState = playing ? 'running' : 'paused'
    svg.querySelectorAll('*').forEach((el) => {
      ;(el as HTMLElement).style.animationPlayState = playing ? 'running' : 'paused'
    })
  })

  panel.querySelector('[data-action="restart"]')!.addEventListener('click', () => {
    // Restart animations by removing and re-adding the SVG
    const parent = svg.parentElement!
    const clone = svg.cloneNode(true) as SVGSVGElement
    parent.replaceChild(clone, svg)
  })

  speedInput.addEventListener('input', () => {
    const speed = parseFloat(speedInput.value)
    svg.style.setProperty('--anim-speed', String(1 / speed))
  })

  panelsDiv.appendChild(panel)
}

// ── Entity Demos ──

// Grid cells at each level
createPanel({
  title: 'Grid Cells (all levels)',
  width: 80,
  height: 20,
  svgContent: [0, 1, 2, 3, 4]
    .map((level, i) => gridCellSvg(`gc-${i}`, i * 15 + 2, 4, level as 0|1|2|3|4, 11))
    .join('\n'),
  cssContent: '',
})

// Invader
createPanel({
  title: 'Invader',
  width: 30,
  height: 30,
  svgContent: invaderSvg('inv-demo', 15, 15, 9),
  cssContent: '',
})

// Ship
createPanel({
  title: 'Ship',
  width: 30,
  height: 30,
  svgContent: shipSvg('ship-demo', 15, 15, 9),
  cssContent: '',
})

// Laser
createPanel({
  title: 'Laser',
  width: 20,
  height: 20,
  svgContent: laserSvg('laser-demo', 10, 10, 4),
  cssContent: '',
})

// Lifecycle cell
createPanel({
  title: 'Lifecycle Cell (plucked)',
  width: 30,
  height: 30,
  svgContent: lifecycleCellSvg('lc-pluck', 15, 15, 11, PLUCK_COLOR),
  cssContent: '',
})

// Lifecycle cell (hatching = invader color)
createPanel({
  title: 'Lifecycle Cell (hatching)',
  width: 30,
  height: 30,
  svgContent: lifecycleCellSvg('lc-hatch', 15, 15, 9, INVADER_COLOR),
  cssContent: '',
})

// Formation with oscillation animation
createPanel({
  title: 'Formation (oscillation)',
  width: 200,
  height: 60,
  svgContent: formationGroupSvg('fm-demo',
    [0, 1, 2, 3].map((i) => invaderSvg(`fm-inv-${i}`, 30 + i * 20, 30, 9)).join('')
  ),
  cssContent: `
    ${oscillationKeyframes('osc-demo', [
      { percent: 0, x: 0, y: 0 },
      { percent: 25, x: 60, y: 0 },
      { percent: 26, x: 60, y: 10 },
      { percent: 50, x: 0, y: 10 },
      { percent: 51, x: 0, y: 20 },
      { percent: 75, x: 60, y: 20 },
      { percent: 76, x: 60, y: 30 },
      { percent: 100, x: 0, y: 30 },
    ])}
    #fm-demo { animation: osc-demo 4s linear infinite; }
  `,
})

// Overlay with fade animation
createPanel({
  title: 'Overlay (fade cycle)',
  width: 80,
  height: 40,
  svgContent: [
    gridCellSvg('ov-gc', 10, 8, 3, 11),
    gridCellSvg('ov-gc2', 30, 8, 4, 11),
    gridCellSvg('ov-gc3', 50, 8, 2, 11),
    overlaySvg('ov-demo', 80, 40, 0),
  ].join(''),
  cssContent: `
    ${fadeKeyframes('fade-cycle-in', 0, 0.6)}
    ${fadeKeyframes('fade-cycle-out', 0.6, 0)}
    #ov-demo {
      animation: fade-cycle-in 1s linear 0s 1 forwards,
                 fade-cycle-out 1s linear 2s 1 forwards;
    }
  `,
})

// Wiggle text demo
createPanel({
  title: 'Score Text (wiggle)',
  width: 160,
  height: 30,
  svgContent: 'SCORE'.split('').map((ch, i) =>
    `<text id="wt-${i}" x="${20 + i * 28}" y="18" font-family="monospace" font-size="16" font-weight="bold" fill="#39d353" text-anchor="middle">${ch}</text>`
  ).join(''),
  cssContent: `
    ${wiggleKeyframes('wiggle-demo', 3)}
    ${[0,1,2,3,4].map(i =>
      `#wt-${i} { animation: wiggle-demo 0.8s ease-in-out ${i * 0.1}s infinite; }`
    ).join('\n')}
  `,
})

// Laser travel animation
createPanel({
  title: 'Laser (traveling)',
  width: 200,
  height: 20,
  svgContent: laserSvg('lt-demo', 10, 10, 4),
  cssContent: `
    #lt-demo {
      --laser-travel: 180px;
      animation: laser-travel 2s linear infinite;
    }
    ${sharedKeyframes()}
  `,
})
