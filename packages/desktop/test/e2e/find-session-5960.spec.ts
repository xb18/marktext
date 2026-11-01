import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer, setSourceMarkdown } from './helpers'

const inputSelector = '.search-bar .search input'
const markdown = 'first apple apple\n\nmiddle apple apple\n\nlast apple apple\n'

async function placeSelection(page: Page, paragraph: number, start: number, end = start): Promise<void> {
  await page.locator('.mu-paragraph').nth(paragraph).evaluate((element, offsets) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    const points: { node: Node; offset: number }[] = []
    for (const target of offsets) {
      walker.currentNode = element
      let remaining = target
      while (walker.nextNode()) {
        const length = walker.currentNode.textContent?.length ?? 0
        if (remaining <= length) {
          points.push({ node: walker.currentNode, offset: remaining })
          break
        }
        remaining -= length
      }
    }
    if (points.length !== 2) throw new Error('Could not resolve editor selection')
    const editable = element.closest<HTMLElement>('[contenteditable="true"]')
    editable?.focus()
    window.getSelection()?.setBaseAndExtent(points[0].node, points[0].offset, points[1].node, points[1].offset)
  }, [start, end])
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

async function openFind(app: ElectronApplication, page: Page): Promise<void> {
  await sendIpcToRenderer(app, 'mt::editor-edit-action', 'find')
  await expect(page.locator(inputSelector)).toBeFocused()
}

async function activeParagraph(page: Page): Promise<string> {
  return page.locator('.mu-highlight').evaluate(element => element.closest('.mu-paragraph')?.textContent ?? '')
}

test.describe('Find session (#5960)', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeEach(async() => {
    const launched = await launchWithMarkdown(markdown)
    app = launched.app
    page = launched.page
  })

  test.afterEach(async() => {
    if (app) await app.close()
  })

  test('keeps the search start while typing, toggling options and reopening Find', async() => {
    await placeSelection(page, 1, 0)
    await openFind(app, page)
    const input = page.locator(inputSelector)
    await input.fill('ap')
    await expect.poll(() => activeParagraph(page)).toBe('middle apple apple')
    await input.fill('apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
    await expect(page.locator('.mu-format-picker-container')).toHaveCSS('opacity', '0')
    await page.locator('.search-bar .is-case-sensitive').click()
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
    await expect(page.locator('.mu-format-picker-container')).toHaveCSS('opacity', '0')
    await openFind(app, page)
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
    await expect(input).toHaveValue('apple')
    await expect.poll(() => input.evaluate(element => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Expected find input')
      return { start: element.selectionStart, end: element.selectionEnd }
    }))
      .toEqual({ start: 0, end: 5 })
  })

  test('keeps Find open after clicking the editor and navigates from the new caret', async() => {
    await placeSelection(page, 0, 0)
    await openFind(app, page)
    await page.locator(inputSelector).fill('apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('1 / 6')
    await page.locator('.mu-paragraph').nth(1).click()
    await expect(page.locator('.search-bar')).toBeVisible()
    await expect(page.locator(inputSelector)).toHaveValue('apple')
    await placeSelection(page, 1, 0)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'findNext')
    await expect.poll(() => activeParagraph(page)).toBe('middle apple apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
  })

  test('preserves both inputs and continues finding after Escape', async() => {
    await placeSelection(page, 1, 0)
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'replace')
    await page.locator(inputSelector).fill('apple')
    await page.locator('.search-bar .replace input').fill('pear')
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
    await page.keyboard.press('Escape')
    await expect(page.locator('.search-bar')).toBeHidden()
    await expect(page.locator('.mu-highlight, .mu-selection')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('apple')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'findNext')
    await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorOffset)).toBe(13)
    await openFind(app, page)
    await expect(page.locator(inputSelector)).toHaveValue('apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('4 / 6')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'replace')
    await expect(page.locator('.search-bar .replace input')).toHaveValue('pear')
  })

  test('uses Shift+Enter for previous and Enter for next', async() => {
    await placeSelection(page, 1, 0)
    await openFind(app, page)
    await page.locator(inputSelector).fill('apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
    await page.locator(inputSelector).press('Shift+Enter')
    await expect(page.locator('.search-bar .search-result')).toContainText('2 / 6')
    await page.locator(inputSelector).press('Enter')
    await expect(page.locator('.search-bar .search-result')).toContainText('3 / 6')
  })

  test('reveals the next result after closing Find without moving on reopen', async() => {
    const longDocument = ['first apple', ...Array.from({ length: 60 }, (_, i) => `paragraph ${i}`), 'last apple'].join('\n\n')
    await setSourceMarkdown(page, app, longDocument)
    await placeSelection(page, 0, 0)
    await openFind(app, page)
    await page.locator(inputSelector).fill('apple')
    await expect(page.locator('.search-bar .search-result')).toContainText('1 / 2')
    await page.keyboard.press('Escape')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'findNext')
    const last = page.locator('.mu-paragraph').last()
    await expect(last).toBeInViewport()
    const selected = () => page.evaluate(() => window.getSelection()?.toString())
    await expect.poll(selected).toBe('apple')
    await openFind(app, page)
    await expect(page.locator('.search-bar .search-result')).toContainText('2 / 2')
    await expect(last).toBeInViewport()
    await expect.poll(selected).toBe('apple')
  })
})
