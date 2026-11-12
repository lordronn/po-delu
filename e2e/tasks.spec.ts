import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { STORAGE_KEY } from '../src/data/storage'

const input = (page: Page) => page.getByRole('textbox', { name: 'Заголовок задачи' })

async function addTask(page: Page, text: string, description?: string) {
  if (description !== undefined) {
    await page.getByRole('button', { name: 'Добавить детали', exact: true }).click()
    await page
      .getByRole('textbox', { name: 'Описание необязательно', exact: true })
      .fill(description)
  }
  await input(page).fill(text)
  await input(page).press('Enter')
}

async function deleteTask(page: Page, title?: string) {
  await page
    .getByRole('button', title ? { name: `Удалить: ${title}`, exact: true } : { name: /^Удалить:/ })
    .click()
}

async function keyboardMove(
  page: Page,
  title: string,
  key: 'ArrowUp' | 'ArrowDown',
  target: string,
) {
  const handle = page.getByRole('button', { name: `Переместить: ${title}`, exact: true })
  await handle.focus()
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await handle.press('Space')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  await page.keyboard.press(key)
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-over="true"] .task-label'),
  ).toHaveText(target)
  await page.keyboard.press('Enter')
}

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('adds, trims, toggles, untoggles and deletes persistently', async ({ page }) => {
  await addTask(page, '  Разобрать почту  ', 'Ответить на важные письма.\nОстальное — в архив.')
  await addTask(page, 'Отправить проект')
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect(page.locator('.task-label')).toHaveText(['Отправить проект', 'Разобрать почту'])
  const mail = page.getByRole('checkbox', { name: /Разобрать почту/ })
  await mail.check()
  await page.reload()
  await expect(mail).toBeChecked()
  if (
    process.env.CAPTURE_SCREENSHOTS &&
    ['desktop', 'mobile', 'compact'].includes(test.info().project.name)
  ) {
    await page.getByRole('button', { name: 'Подробности: Разобрать почту', exact: false }).click()
    await mkdir('docs/screenshots', { recursive: true })
    await page.screenshot({
      path: `docs/screenshots/${test.info().project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  await mail.uncheck()
  await page.reload()
  await expect(mail).not.toBeChecked()
  await deleteTask(page, 'Разобрать почту')
  await page.reload()
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(mail).toHaveCount(0)
})

test('rejects whitespace, bounds input and permits duplicate titles', async ({ page }) => {
  await addTask(page, '   ')
  await expect(page.getByRole('alert')).toHaveText('Укажите заголовок задачи.')
  await expect(input(page)).toBeFocused()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await audit(page)
  await addTask(page, 'Повтор')
  await addTask(page, 'Повтор')
  await expect(page.getByRole('checkbox', { name: /Повтор/ })).toHaveCount(2)
  await input(page).fill('Д'.repeat(350))
  await expect(input(page)).toHaveValue('Д'.repeat(300))
  await input(page).press('Enter')
  await expect(page.getByRole('checkbox')).toHaveCount(3)
  await expect(page.locator('.task-label').first()).toHaveText('Д'.repeat(300))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('keyboard flow preserves focus on toggle, delete and undo', async ({ page, browserName }) => {
  const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
  await page.keyboard.press(tab)
  await expect(page.getByRole('link', { name: 'Перейти к списку задач' })).toBeFocused()
  await page.keyboard.press(tab)
  await expect(input(page)).toBeFocused()
  await page.keyboard.insertText('Проверить клавиатуру')
  await page.keyboard.press('Enter')
  await expect(input(page)).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: 'Добавить задачу', exact: true })).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: 'Добавить детали', exact: true })).toBeFocused()
  await page.keyboard.press(tab)
  const checkbox = page.getByRole('checkbox')
  await expect(checkbox).toBeFocused()
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  await expect(checkbox).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: /^Изменить:/ })).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: /^Удалить:/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input(page)).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: 'Добавить задачу', exact: true })).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: 'Добавить детали', exact: true })).toBeFocused()
  await page.keyboard.press(tab)
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(checkbox).toBeChecked()
  await expect(checkbox).toBeFocused()
})

test('undo restores the previous position and completion state without a timer', async ({
  page,
}) => {
  await addTask(page, 'Первое')
  await addTask(page, 'Второе')
  await addTask(page, 'Третье')
  await page.getByRole('checkbox', { name: /Второе/ }).check()
  await deleteTask(page, 'Второе')
  await expect(page.getByRole('checkbox', { name: /Первое/ })).toBeFocused()
  await addTask(page, 'Четвёртое')
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.locator('.task-label')).toHaveText(['Четвёртое', 'Третье', 'Второе', 'Первое'])
  await expect(page.getByRole('checkbox', { name: /Второе/ })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Второе/ })).toBeChecked()
})

test('renders HTML-like input as inert text', async ({ page }) => {
  const payload = '<img src=x onerror="window.__xss=true"><script>alert(1)</script>'
  await addTask(page, payload)
  await page.reload()
  await expect(page.locator('.task-label')).toHaveText(payload)
  await expect(page.locator('.task-list img, .task-list script')).toHaveCount(0)
  expect(await page.evaluate(() => '__xss' in window)).toBe(false)
})

test('preserves corrupt data until recovery is explicitly confirmed', async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Сохранённые данные не удалось прочитать')
  await addTask(page, 'Временная задача')
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Сохранить текущий список' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('{broken')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Сохранить текущий список' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Временная задача/ })).toBeVisible()
})

test('handles quota failures without losing in-memory changes and can retry', async ({ page }) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem
    let fail = true
    window.addEventListener('allow-writes', () => {
      fail = false
    })
    Storage.prototype.setItem = function (name, value) {
      if (name === key && fail) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      original.call(this, name, value)
    }
  }, STORAGE_KEY)
  await page.reload()
  await addTask(page, 'Не потерять')
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('Задачи пока не сохраняются')
  await addTask(page, '   ')
  await expect(page.getByRole('alert')).toHaveCount(2)
  await audit(page)
  await input(page).fill('')
  await page.evaluate(() => window.dispatchEvent(new Event('allow-writes')))
  await page.getByRole('button', { name: 'Повторить сохранение' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('checkbox', { name: /Не потерять/ })).toBeVisible()
})

test('works when access to localStorage is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Blocked', 'SecurityError')
      },
    })
  })
  await page.reload()
  await addTask(page, 'В памяти')
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('Задачи пока не сохраняются')
})

test('synchronizes tabs while preserving draft and focus, including external clear', async ({
  page,
  context,
}) => {
  const other = await context.newPage()
  await other.goto('/')
  await addTask(page, 'Общая задача')
  await expect(other.getByRole('checkbox')).toHaveCount(1)
  await input(other).fill('Незаконченный ввод')
  await page.getByRole('checkbox').check()
  await expect(other.getByRole('checkbox')).toBeChecked()
  await expect(input(other)).toHaveValue('Незаконченный ввод')
  await expect(input(other)).toBeFocused()
  await other.getByRole('checkbox').focus()
  await deleteTask(page)
  await expect(other.getByRole('checkbox')).toHaveCount(0)
  await expect(input(other)).toBeFocused()
  await addTask(page, 'После удаления')
  await expect(other.getByRole('checkbox')).toHaveCount(1)
  await page.evaluate(() => localStorage.clear())
  await expect(other.getByRole('checkbox')).toHaveCount(0)
  await other.close()
})

test('ignores unrelated storage keys and sessionStorage', async ({ page }) => {
  await addTask(page, 'Оставить')
  await page.evaluate((key) => {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'unrelated',
        newValue: '{broken',
        storageArea: localStorage,
      }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key, newValue: '{broken', storageArea: sessionStorage }),
    )
  }, STORAGE_KEY)
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('has no axe WCAG A/AA violations in empty, populated and warning states', async ({ page }) => {
  await audit(page)
  await addTask(page, 'Проверить доступность')
  await page.getByRole('checkbox').check()
  await audit(page)
  await deleteTask(page)
  await audit(page)
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await page.reload()
  await audit(page)
})

test('does not overflow at the current viewport, including long unbroken text', async ({
  page,
}) => {
  await addTask(page, 'З'.repeat(300))
  const titleMetrics = await page.locator('.task-label').evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
    text: element.textContent,
  }))
  const maxLines = (test.info().project.use.viewport?.width ?? 1280) > 600 ? 1 : 2
  expect(titleMetrics.height).toBeLessThanOrEqual(titleMetrics.lineHeight * maxLines + 8)
  expect(titleMetrics.text).toBe('З'.repeat(300))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await deleteTask(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('restores focus when an external update removes the undo panel', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await addTask(page, 'Удалить локально')
  await expect(other.getByRole('checkbox')).toHaveCount(1)
  await deleteTask(page)
  await expect(other.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Отменить', exact: true }).focus()
  await addTask(other, 'Из другой вкладки')
  await expect(page.getByRole('button', { name: 'Отменить', exact: true })).toHaveCount(0)
  await expect(input(page)).toBeFocused()
  await other.close()
})

test('restores focus when an external recovery removes the warning', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await other.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await expect(page.getByRole('alert')).toContainText('Сохранённые данные не удалось прочитать')
  await page.getByRole('button', { name: 'Сохранить текущий список' }).focus()
  await other.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(input(page)).toBeFocused()
  await other.close()
})

test('protects unsaved edits from another tab until overwrite is explicitly confirmed', async ({
  page,
  context,
}) => {
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem
    let fail = true
    window.addEventListener('allow-writes', () => {
      fail = false
    })
    Storage.prototype.setItem = function (name, value) {
      if (name === key && fail) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      original.call(this, name, value)
    }
  }, STORAGE_KEY)
  await page.reload()
  await addTask(page, 'Локальные правки')
  const other = await context.newPage()
  await other.goto('/')
  await addTask(other, 'Внешняя задача')
  await expect(page.getByRole('alert')).toContainText('В другой вкладке есть изменения')
  await expect(page.locator('.task-label')).toHaveText(['Локальные правки'])
  await page.getByRole('checkbox').check()
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  expect(stored).toContain('Внешняя задача')
  expect(stored).not.toContain('Локальные правки')
  await audit(page)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Сохранить текущий список' }).click()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(stored)
  await page.evaluate(() => window.dispatchEvent(new Event('allow-writes')))
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Сохранить текущий список' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(input(page)).toBeFocused()
  await expect(other.locator('.task-label')).toHaveText(['Локальные правки'])
  await expect(other.getByRole('checkbox')).toBeChecked()
  await page.reload()
  await expect(page.getByRole('checkbox')).toBeChecked()
  await other.close()
})

test('valid non-UUID ids do not collide with focus targets', async ({ page }) => {
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          tasks: [
            { id: 'a', text: 'Удалить', done: false },
            { id: 'input', text: 'Сосед', done: false },
          ],
        }),
      ),
    STORAGE_KEY,
  )
  await page.reload()
  await deleteTask(page, 'Удалить')
  await expect(page.getByRole('checkbox', { name: /Сосед/ })).toBeFocused()
})

test('creates title and multiline description, expands and edits without changing completion', async ({
  page,
}) => {
  await addTask(page, 'План релиза', 'Подготовить сборку\nПроверить CI')
  await expect(page.getByText('Подготовить сборку\nПроверить CI', { exact: true })).toHaveCount(0)
  const details = page.getByRole('button', { name: 'Подробности: План релиза', exact: false })
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.task-description')).toHaveText('Подготовить сборку\nПроверить CI')
  await page.getByRole('checkbox').check()
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Изменить: План релиза', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Изменить задачу' })
  await expect(dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).fill('Релиз готов')
  await dialog
    .getByRole('textbox', { name: 'Описание', exact: true })
    .fill('Сборка проверена\nМожно отправлять')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Изменить: Релиз готов', exact: true }),
  ).toBeFocused()
  await page.reload()
  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: 'Подробности: Релиз готов', exact: false }).click()
  await expect(page.locator('.task-description')).toHaveText('Сборка проверена\nМожно отправлять')
  await audit(page)
})

test('editing validates title, supports multiline input and cancels with Escape', async ({
  page,
}) => {
  await addTask(page, 'Оригинал', 'Детали')
  await page.getByRole('button', { name: 'Подробности: Оригинал', exact: false }).click()
  await page.getByRole('button', { name: 'Изменить: Оригинал', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).fill('  ')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Укажите заголовок задачи.')
  await expect(dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true })).toBeFocused()
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).fill('Черновик')
  const description = dialog.getByRole('textbox', { name: 'Описание', exact: true })
  await description.fill('Первая строка')
  await description.press('Enter')
  await description.pressSequentially('Вторая строка')
  await page.mouse.click(4, 4)
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.task-label')).toHaveText(['Оригинал'])
  await expect(page.locator('.task-description')).toHaveText('Детали')
})

test('drag and undo preserve details, state and order', async ({ page }) => {
  await addTask(page, 'Первое', 'Детали первого')
  await addTask(page, 'Второе', 'Детали второго')
  await addTask(page, 'Третье', 'Детали третьего')
  await page.getByRole('button', { name: 'Подробности: Третье', exact: false }).click()
  await keyboardMove(page, 'Третье', 'ArrowDown', 'Второе')
  await expect(page.locator('.task-label')).toHaveText(['Второе', 'Третье', 'Первое'])
  await page.getByRole('checkbox', { name: /Третье/ }).check()
  await deleteTask(page, 'Третье')
  await page.getByRole('button', { name: 'Подробности: Первое', exact: false }).click()
  await keyboardMove(page, 'Первое', 'ArrowUp', 'Второе')
  await expect(page.locator('.task-label')).toHaveText(['Первое', 'Второе'])
  await page.getByRole('button', { name: 'Отменить', exact: true }).click()
  await expect(page.locator('.task-label')).toHaveText(['Третье', 'Первое', 'Второе'])
  await page.reload()
  await expect(page.locator('.task-label')).toHaveText(['Третье', 'Первое', 'Второе'])
  await expect(page.getByRole('checkbox', { name: /Третье/ })).toBeChecked()
  await page.getByRole('button', { name: 'Подробности: Третье', exact: false }).click()
  await expect(page.locator('.task-item').first().locator('.task-description')).toHaveText(
    'Детали третьего',
  )
})

test('pointer drag reorders by the handle, persists and does not toggle or expand', async ({
  page,
}) => {
  await addTask(page, 'Первое')
  await addTask(page, 'Второе')
  await addTask(page, 'Третье')
  await page.getByRole('button', { name: 'Переместить: Третье', exact: true }).focus()
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const from = await page
    .getByRole('button', { name: 'Переместить: Третье', exact: true })
    .boundingBox()
  if (!from) throw new Error('Drag source must be rendered')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 3 })
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  const to = await page.locator('.task-list > .task-item:not([inert])').last().boundingBox()
  if (!to) throw new Error('Drop target must be rendered')
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 12 })
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-over="true"]').locator('.task-label'),
  ).toHaveText('Первое')
  await page.mouse.up()
  await expect(page.locator('.task-list > .task-item:not([inert]) .task-label')).toHaveText([
    'Второе',
    'Первое',
    'Третье',
  ])
  await expect(page.getByRole('button', { name: 'Подробности: Третье', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('checkbox', { name: /Третье/ })).not.toBeChecked()
  await page.reload()
  await expect(page.locator('.task-label')).toHaveText(['Второе', 'Первое', 'Третье'])
})

test('keyboard drag supports reorder and Escape cancellation', async ({ page }) => {
  await addTask(page, 'Первое')
  await addTask(page, 'Второе')
  await addTask(page, 'Третье')
  const handle = page.getByRole('button', { name: 'Переместить: Третье', exact: true })
  await handle.focus()
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.keyboard.press('Space')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-over="true"]').locator('.task-label'),
  ).toHaveText('Второе')
  await page.keyboard.press('Enter')
  await expect(page.locator('.task-label')).toHaveText(['Второе', 'Третье', 'Первое'])
  const raw = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
  await handle.focus()
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.keyboard.press('Space')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Escape')
  await expect(page.locator('.task-label')).toHaveText(['Второе', 'Третье', 'Первое'])
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(raw)
})

test('external updates during a drag cancel its commit instead of applying stale positions', async ({
  page,
  context,
}) => {
  await addTask(page, 'Первое')
  await addTask(page, 'Второе')
  const other = await context.newPage()
  await other.goto('/')
  const handle = page.getByRole('button', { name: 'Переместить: Второе', exact: true })
  await handle.focus()
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.keyboard.press('Space')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-over="true"]').locator('.task-label'),
  ).toHaveText('Первое')
  await addTask(other, 'Внешняя задача')
  await expect(page.locator('.task-list > .task-item:not([inert]) .task-label')).toContainText([
    'Внешняя задача',
    'Второе',
    'Первое',
  ])
  await page.keyboard.press('Enter')
  await expect(
    page.getByText('Список изменился во время переноса. Порядок не изменён — повторите перенос.'),
  ).toBeVisible()
  await expect(page.locator('.task-list > .task-item:not([inert]) .task-label')).toHaveText([
    'Внешняя задача',
    'Второе',
    'Первое',
  ])
  await other.close()
})

test('draft survives external edits and can be saved separately without overwriting the other tab', async ({
  page,
  context,
}) => {
  await addTask(page, 'Общая задача', 'Исходное описание')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('button', { name: 'Подробности: Общая задача', exact: false }).click()
  await page.getByRole('button', { name: 'Изменить: Общая задача', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).fill('Мой черновик')
  await dialog.getByRole('textbox', { name: 'Описание', exact: true }).fill('Мои детали')
  await other.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!)
    data.tasks[0].description = 'Внешние детали'
    localStorage.setItem(key, JSON.stringify(data))
  }, STORAGE_KEY)
  await expect(dialog.getByRole('alert')).toContainText('Задача изменилась в другой вкладке')
  await expect(dialog.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(
    'Мои детали',
  )
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toHaveCount(0)
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).press('Enter')
  await expect(dialog.locator('#edit-error')).toHaveText(
    'Выберите «Загрузить актуальную» или «Добавить как новую».',
  )
  await expect(page.locator('.task-label')).toHaveText(['Общая задача'])
  await audit(page)
  await dialog.getByRole('button', { name: 'Загрузить актуальную', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(
    'Внешние детали',
  )
  await expect(dialog.getByRole('button', { name: 'Сохранить', exact: true })).toBeVisible()
  await dialog.getByRole('textbox', { name: 'Заголовок задачи', exact: true }).fill('Мой черновик')
  await dialog.getByRole('textbox', { name: 'Описание', exact: true }).fill('Мои детали')
  await other.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!)
    data.tasks[0].description = 'Ещё внешние детали'
    localStorage.setItem(key, JSON.stringify(data))
  }, STORAGE_KEY)
  await expect(dialog.getByRole('alert')).toContainText('Задача изменилась в другой вкладке')
  await dialog.getByRole('button', { name: 'Добавить как новую', exact: true }).click()
  await expect(page.locator('.task-label')).toHaveText(['Мой черновик', 'Общая задача'])
  await expect(other.locator('.task-label')).toHaveText(['Мой черновик', 'Общая задача'])
  await expect(page.getByText('Ещё внешние детали', { exact: true })).toBeVisible()
  await other.close()
})

test('draft survives external deletion and can become a new task', async ({ page, context }) => {
  await addTask(page, 'Удаляемая задача', 'Детали')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('button', { name: 'Подробности: Удаляемая задача', exact: false }).click()
  await page.getByRole('button', { name: 'Изменить: Удаляемая задача', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Описание', exact: true }).fill('Несохранённые детали')
  await deleteTask(other, 'Удаляемая задача')
  await expect(dialog.getByRole('alert')).toContainText('Задача удалена в другой вкладке')
  await expect(dialog.getByRole('textbox', { name: 'Описание', exact: true })).toHaveValue(
    'Несохранённые детали',
  )
  await dialog.getByRole('button', { name: 'Добавить как новую', exact: true }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await page.getByRole('button', { name: 'Подробности: Удаляемая задача', exact: false }).click()
  await expect(page.getByText('Несохранённые детали', { exact: true })).toBeVisible()
  await other.close()
})

test('migrates existing tasks without a startup write and protects details from an old tab', async ({
  page,
  context,
}) => {
  const legacy = JSON.stringify({
    version: 1,
    tasks: [{ id: 'legacy', text: 'Старая задача', done: true }],
  })
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: legacy,
  })
  await page.reload()
  await expect(page.getByRole('checkbox')).toBeChecked()
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(legacy)
  await addTask(page, 'Новая задача', 'Новые детали')
  expect(
    JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))!).version,
  ).toBe(2)
  const other = await context.newPage()
  await other.goto('/')
  await other.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: STORAGE_KEY,
    raw: legacy,
  })
  await expect(page.getByRole('alert')).toContainText('В другой вкладке открыта старая версия')
  await expect(page.locator('.task-label')).toHaveText(['Новая задача', 'Старая задача'])
  await audit(page)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Сохранить текущий список' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Подробности: Новая задача', exact: false }).click()
  await expect(page.getByText('Новые детали', { exact: true })).toBeVisible()
  await other.close()
})

test('description length, long text and HTML-like content remain safe and usable', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Добавить детали', exact: true }).click()
  const description = page.getByRole('textbox', { name: 'Описание необязательно', exact: true })
  await description.fill('Д'.repeat(2100))
  await expect(description).toHaveValue('Д'.repeat(2000))
  await input(page).fill('Длинное описание')
  await input(page).press('Enter')
  await page.getByRole('button', { name: 'Подробности: Длинное описание', exact: false }).click()
  await expect(page.locator('.task-description')).toHaveText('Д'.repeat(2000))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Изменить: Длинное описание', exact: true }).click()
  await audit(page)
  await page.keyboard.press('Escape')
  const payload = '<img src=x onerror="window.__xss=true">\n<script>alert(1)</script>'
  await addTask(page, 'Безопасный текст', payload)
  await page.getByRole('button', { name: 'Подробности: Безопасный текст', exact: false }).click()
  await expect(page.locator('.task-item').first().locator('.task-description')).toHaveText(payload)
  await expect(page.locator('.task-details img, .task-details script')).toHaveCount(0)
  expect(await page.evaluate(() => '__xss' in window)).toBe(false)
})

test('storage recovery with identical tasks does not invalidate an active drag', async ({
  page,
  context,
}) => {
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 2,
          tasks: [
            { id: 'b', title: 'Второе', description: '', done: false },
            { id: 'a', title: 'Первое', description: '', done: false },
          ],
        }),
      ),
    STORAGE_KEY,
  )
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem
    let fail = true
    window.addEventListener('allow-writes', () => {
      fail = false
    })
    Storage.prototype.setItem = function (name, value) {
      if (name === key && fail) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      original.call(this, name, value)
    }
  }, STORAGE_KEY)
  await page.reload()
  await page.getByRole('checkbox', { name: /Второе/ }).check()
  await expect(page.getByRole('alert')).toContainText('Задачи пока не сохраняются')
  const other = await context.newPage()
  await other.goto('/')
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  await page.getByRole('button', { name: 'Переместить: Второе', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
  ).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await expect(
    page.locator('.task-list > .task-item:not([inert])[data-over="true"]').locator('.task-label'),
  ).toHaveText('Первое')
  await other.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!)
    data.tasks[0].done = true
    localStorage.setItem(key, JSON.stringify(data))
  }, STORAGE_KEY)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => window.dispatchEvent(new Event('allow-writes')))
  await page.keyboard.press('Enter')
  await expect(page.locator('.task-list > .task-item:not([inert]) .task-label')).toHaveText([
    'Первое',
    'Второе',
  ])
  await expect(page.locator('.drag-notice')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.task-label')).toHaveText(['Первое', 'Второе'])
  await other.close()
})

test('composer focuses details, preserves a collapsed draft and resets after button submission', async ({
  page,
}) => {
  await input(page).fill('Подготовить тестовое')
  const toggle = page.getByRole('button', { name: 'Добавить детали', exact: true })
  await toggle.click()
  const description = page.getByRole('textbox', { name: 'Описание необязательно', exact: true })
  await expect(description).toBeFocused()
  await description.fill('Проверить интерфейс на телефоне.\nПриложить ссылку на GitHub.')
  const tab =
    test.info().project.use.browserName === 'webkit' && process.platform === 'darwin'
      ? 'Alt+Tab'
      : 'Tab'
  await description.press(tab === 'Alt+Tab' ? 'Alt+Shift+Tab' : 'Shift+Tab')
  await expect(page.getByRole('button', { name: 'Свернуть детали', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(toggle).toBeFocused()
  await toggle.click()
  await expect(description).toBeFocused()
  await expect(description).toHaveValue(
    'Проверить интерфейс на телефоне.\nПриложить ссылку на GitHub.',
  )
  await audit(page)
  if (
    process.env.CAPTURE_SCREENSHOTS &&
    ['desktop', 'mobile', 'compact'].includes(test.info().project.name)
  ) {
    await mkdir('docs/screenshots', { recursive: true })
    await page.screenshot({
      path: `docs/screenshots/composer-${test.info().project.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
  await page.getByRole('button', { name: 'Добавить задачу', exact: true }).click()
  await expect(input(page)).toHaveValue('')
  await expect(input(page)).toBeFocused()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.task-description')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.task-description')).toHaveCount(0)
  const details = page.getByRole('button', {
    name: 'Подробности: Подготовить тестовое',
    exact: true,
  })
  if (test.info().project.use.hasTouch) await details.locator('.task-chevron').tap()
  else await details.locator('.task-chevron').click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('.task-description')).toHaveText(
    'Проверить интерфейс на телефоне.\nПриложить ссылку на GitHub.',
  )
  await details.press('Enter')
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.task-description')).toHaveCount(0)
  await toggle.click()
  await expect(description).toHaveValue('')
})

test('keeps composer and editor actions reachable in a short landscape viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 740, height: 360 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await addTask(
    page,
    'Проверить мобильную версию',
    'Детали для горизонтального экрана.\nВторая строка.',
  )
  await page
    .getByRole('button', { name: 'Изменить: Проверить мобильную версию', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  const description = dialog.getByRole('textbox', { name: 'Описание', exact: true })
  await description.fill('Длинный текст.\n'.repeat(30))
  const save = dialog.getByRole('button', { name: 'Сохранить', exact: true })
  await save.scrollIntoViewIfNeeded()
  const bounds = await save.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(360)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await save.click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await page
    .getByRole('button', { name: 'Подробности: Проверить мобильную версию', exact: false })
    .click()
  await expect(page.locator('.task-description')).toHaveText('Длинный текст.\n'.repeat(30).trim())
})

test('arrow fully hides both single-line and multiline descriptions after repeated toggles', async ({
  page,
}) => {
  for (const [title, description] of [
    ['Короткое описание', 'Текст виден только после раскрытия.'],
    ['Длинное описание', 'Первая строка описания.\nВторая строка описания.'],
  ] as const) {
    await addTask(page, title, description)
    const details = page.getByRole('button', { name: `Подробности: ${title}`, exact: true })
    const row = page.locator('.task-item').filter({ has: details })
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await expect(row.locator('.task-description')).toHaveCount(0)
    for (let cycle = 0; cycle < 2; cycle++) {
      const arrow = details.locator('.task-chevron')
      if (test.info().project.use.hasTouch) await arrow.tap()
      else await arrow.click()
      await expect(details).toHaveAttribute('aria-expanded', 'true')
      await expect(row.locator('.task-description')).toHaveText(description)
      await details.focus()
      await details.press('Enter')
      await expect(details).toHaveAttribute('aria-expanded', 'false')
      await expect(row.locator('.task-description')).toHaveCount(0)
    }
  }
  await page.reload()
  await expect(page.locator('.task-description')).toHaveCount(0)
  await audit(page)
})

test('compact rows keep drag, edit and delete available without a mode switch', async ({
  page,
}) => {
  await addTask(page, 'Без описания')
  await addTask(page, 'С описанием', 'Описание полностью скрыто до раскрытия.')
  await expect(page.locator('#new-description')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Подробности: Без описания', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Переместить:/ })).toHaveCount(2)
  await expect(page.getByRole('listitem')).toHaveCount(2)
  const first = page.locator('.task-item').first()
  const row = await first.boundingBox()
  expect(row!.y).toBeLessThan(380)
  const checkbox = await first.getByRole('checkbox').boundingBox()
  const edit = await first.getByRole('button', { name: /^Изменить:/ }).boundingBox()
  expect(Math.abs(checkbox!.y + checkbox!.height / 2 - edit!.y - edit!.height / 2)).toBeLessThan(1)
  expect(edit!.width).toBeGreaterThanOrEqual(44)
  expect(edit!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('button', { name: 'Порядок', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Изменить:/ })).toHaveCount(2)
  const handle = await first.getByRole('button', { name: /^Переместить:/ }).boundingBox()
  expect(handle!.width).toBeGreaterThanOrEqual(44)
  expect(handle!.height).toBeGreaterThanOrEqual(44)
  expect(handle!.x).toBeGreaterThanOrEqual(0)
  expect(handle!.x + handle!.width).toBeLessThanOrEqual(checkbox!.x - 12 + 1)
  await expect(page.getByRole('checkbox').first()).toBeEnabled()
  await expect(page.getByRole('button', { name: /^Удалить:/ }).first()).toBeEnabled()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await audit(page)
})

test('external removal of a task with its delete control focused restores focus to the composer', async ({
  page,
  context,
}) => {
  await addTask(page, 'Внешнее удаление')
  const other = await context.newPage()
  await other.goto('/')
  await page.getByRole('button', { name: 'Удалить: Внешнее удаление', exact: true }).focus()
  await deleteTask(other, 'Внешнее удаление')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(input(page)).toBeFocused()
  await other.close()
})

test('removing and restoring a description keeps it collapsed until explicitly opened', async ({
  page,
}) => {
  await addTask(page, 'Менять описание', 'Первое описание')
  await page.getByRole('button', { name: 'Подробности: Менять описание', exact: true }).click()
  await expect(page.locator('.task-description')).toHaveText('Первое описание')
  await page.getByRole('button', { name: 'Изменить: Менять описание', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Описание', exact: true }).fill('')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Подробности: Менять описание', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.task-description')).toHaveCount(0)
  await page.getByRole('button', { name: 'Изменить: Менять описание', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Описание', exact: true }).fill('Новое описание')
  await dialog.getByRole('button', { name: 'Сохранить', exact: true }).click()
  const details = page.getByRole('button', { name: 'Подробности: Менять описание', exact: true })
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.task-description')).toHaveCount(0)
  await details.click()
  await expect(page.locator('.task-description')).toHaveText('Новое описание')
})

test('touch drag by the handle reorders tasks and persists without completing them', async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium' || !test.info().project.use.hasTouch,
    'Trusted touch gestures use Chromium CDP; other projects cover mouse and keyboard drag.',
  )
  await addTask(page, 'Первое')
  await addTask(page, 'Второе')
  await addTask(page, 'Третье')
  await page
    .locator('.task-list')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const handle = await page
    .getByRole('button', { name: 'Переместить: Третье', exact: true })
    .boundingBox()
  if (!handle) throw new Error('Touch handle must be visible')
  const session = await context.newCDPSession(page)
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  const point = (nextY: number) => [{ x, y: nextY, id: 0, radiusX: 6, radiusY: 6, force: 1 }]
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) })
    // The touch sensor activates after its intentional hold delay.
    await expect(
      page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
    ).toHaveCount(1)
    const target = await page.locator('.task-list > .task-item:not([inert])').last().boundingBox()
    if (!target) throw new Error('Touch drop target must be visible')
    const destination = target.y + target.height / 2
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(y + ((destination - y) * step) / 12),
      })
    }
    await expect(
      page.locator('.task-list > .task-item:not([inert])[data-over="true"] .task-label'),
    ).toHaveText('Первое')
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.task-list > .task-item:not([inert]) .task-label')).toHaveText([
      'Второе',
      'Первое',
      'Третье',
    ])
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(0)
    await page.reload()
    await expect(page.locator('.task-label')).toHaveText(['Второе', 'Первое', 'Третье'])
    await expect(page.getByRole('button', { name: /^Переместить:/ })).toHaveCount(3)
    for (let index = 0; index < 8; index++) await addTask(page, `Дополнительная задача ${index}`)
    await input(page).blur()
    await page.evaluate(() => scrollTo(0, 0))
    const beforeScroll = await page.locator('.task-label').allTextContents()
    const viewport = page.viewportSize()!
    const scrollStart = viewport.height - 100
    const scrollPoint = (nextY: number) => [
      { x: viewport.width / 2, y: nextY, id: 0, radiusX: 6, radiusY: 6, force: 1 },
    ]
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: scrollPoint(scrollStart),
    })
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: scrollPoint(scrollStart - (220 * step) / 12),
      })
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(40)
    await expect(
      page.locator('.task-list > .task-item:not([inert])[data-dragging="true"]'),
    ).toHaveCount(0)
    await expect(page.locator('.task-label')).toHaveText(beforeScroll)
  } finally {
    await session
      .send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      .catch(() => {})
    await session.detach()
  }
})
