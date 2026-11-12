import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import AxeBuilder from '@axe-core/playwright'
import { STORAGE_KEY } from '../src/data/storage'

const input = (page: Page) => page.getByRole('textbox', { name: 'Что нужно сделать?' })

async function addTask(page: Page, text: string) {
  await input(page).fill(text)
  await input(page).press('Enter')
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
  await addTask(page, '  Разобрать почту  ')
  await addTask(page, 'Отправить проект')
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await expect(page.locator('.task-label')).toHaveText(['Отправить проект', 'Разобрать почту'])
  const mail = page.getByRole('checkbox', { name: /Разобрать почту/ })
  await mail.check()
  await page.reload()
  await expect(mail).toBeChecked()
  if (process.env.CAPTURE_SCREENSHOTS) {
    await mkdir('docs/screenshots', { recursive: true })
    await page.screenshot({
      path: `docs/screenshots/${test.info().project.name}.png`,
      fullPage: true,
    })
  }
  await mail.uncheck()
  await page.reload()
  await expect(mail).not.toBeChecked()
  await page.getByRole('button', { name: 'Удалить: Разобрать почту', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  await expect(mail).toHaveCount(0)
})

test('rejects whitespace, bounds input and permits duplicate titles', async ({ page }) => {
  await addTask(page, '   ')
  await expect(page.getByRole('alert')).toHaveText('Напишите, что нужно сделать.')
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

test('keyboard flow preserves focus on toggle, delete and undo', async ({ page }) => {
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Перейти к списку задач' })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(input(page)).toBeFocused()
  await page.keyboard.insertText('Проверить клавиатуру')
  await page.keyboard.press('Enter')
  await expect(input(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Добавить', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  const checkbox = page.getByRole('checkbox')
  await expect(checkbox).toBeFocused()
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  await expect(checkbox).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /^Удалить:/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(input(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
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
  await page.getByRole('button', { name: 'Удалить: Второе', exact: true }).click()
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
  await page.getByRole('button', { name: /^Удалить:/ }).click()
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
  await page.getByRole('button', { name: /^Удалить:/ }).click()
  await audit(page)
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY)
  await page.reload()
  await audit(page)
})

test('does not overflow at the current viewport, including long unbroken text', async ({
  page,
}) => {
  await addTask(page, 'З'.repeat(300))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.getByRole('button', { name: /^Удалить:/ }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
})

test('restores focus when an external update removes the undo panel', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto('/')
  await addTask(page, 'Удалить локально')
  await expect(other.getByRole('checkbox')).toHaveCount(1)
  await page.getByRole('button', { name: /^Удалить:/ }).click()
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
  await page.getByRole('button', { name: 'Удалить: Удалить', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /Сосед/ })).toBeFocused()
})
