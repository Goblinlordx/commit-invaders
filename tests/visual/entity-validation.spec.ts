import { test, expect } from '@playwright/test'

const ENTITIES = ['grid', 'invader', 'ship', 'laser', 'lifecycle', 'overlay'] as const
const BASE_URL = 'http://localhost:5180'

// Test frames: idle, plucking, traveling, hatching, active combat, ending
const KEY_FRAMES = [0, 30, 80, 100, 120, 200, 400]

test.describe('Entity Validation — Canvas vs SVG pixel-diff', () => {
  for (const entity of ENTITIES) {
    test(`${entity}: matches at key frames`, async ({ page }) => {
      await page.goto(BASE_URL)
      await page.waitForFunction(() => (window as any).validatorController !== undefined, { timeout: 30000 })

      for (const frame of KEY_FRAMES) {
        // Set entity and frame
        await page.evaluate(
          ({ entity, frame }) => {
            const ctrl = (window as any).validatorController
            ctrl.setEntity(entity)
            ctrl.setFrame(Math.min(frame, ctrl.getTotalFrames() - 1))
          },
          { entity, frame },
        )

        // Run pixel diff
        const result = await page.evaluate(async () => {
          const ctrl = (window as any).validatorController
          return await ctrl.pixelDiff()
        })

        // Assert under 1% diff (static SVG should match canvas exactly for hitbox rects)
        expect(result.diffPercent, `${entity} at frame ${frame}: ${result.diffPercent.toFixed(2)}% diff`).toBeLessThan(1)
      }
    })
  }
})
