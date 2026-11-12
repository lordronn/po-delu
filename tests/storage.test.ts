import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRepository,
  decodeTasks,
  getBrowserStorage,
  SCHEMA_VERSION,
  STORAGE_KEY,
} from '../src/data/storage'

const task = { id: 'a', title: 'Задача', description: 'Детали\nВторая строка', done: false }

afterEach(() => vi.unstubAllGlobals())

describe('storage boundary', () => {
  it('treats missing data as an empty list', () => {
    expect(decodeTasks(null)).toEqual({ status: 'saved', tasks: [], version: null })
  })

  it('ignores unknown fields and trims both text fields while preserving newlines', () => {
    expect(
      decodeTasks(
        JSON.stringify({
          version: 2,
          extra: true,
          tasks: [
            {
              ...task,
              title: ' Задача ',
              description: ' Детали\nВторая строка ',
              unexpected: 'field',
            },
          ],
        }),
      ),
    ).toEqual({ status: 'saved', tasks: [task], version: 2 })
  })

  it('migrates v1 text to title in memory, retaining ids, completion and order', () => {
    const raw = JSON.stringify({
      version: 1,
      tasks: [
        { id: 'a', text: '  Раньше  ', done: true },
        { id: 'b', text: 'Второе', done: false },
      ],
    })
    const backend = { getItem: () => raw, setItem: vi.fn() }
    expect(createRepository(backend).read()).toEqual({
      status: 'saved',
      version: 1,
      tasks: [
        { id: 'a', title: 'Раньше', description: '', done: true },
        { id: 'b', title: 'Второе', description: '', done: false },
      ],
    })
    expect(backend.setItem).not.toHaveBeenCalled()
  })

  it.each([
    '{bad',
    '',
    'null',
    '[]',
    'true',
    '{}',
    JSON.stringify({ version: 3, tasks: [] }),
    JSON.stringify({ version: 2, tasks: {} }),
    ...[
      null,
      [],
      {},
      { ...task, id: '' },
      { ...task, id: ' ' },
      { ...task, id: 'a b' },
      { ...task, id: ' a' },
      { ...task, id: 1 },
      { ...task, title: '' },
      { ...task, title: '  ' },
      { ...task, title: 1 },
      { ...task, title: 'x'.repeat(301) },
      { ...task, description: null },
      { ...task, description: 'x'.repeat(2001) },
      { ...task, done: 1 },
      { ...task, done: null },
    ].map((item) => JSON.stringify({ version: 2, tasks: [item] })),
    JSON.stringify({ version: 2, tasks: [task, task] }),
    JSON.stringify({ version: 1, tasks: [{ id: 'a', text: '', done: true }] }),
    JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Wrong schema', done: true }] }),
  ])('rejects malformed or unsupported records: %s', (raw) => {
    expect(decodeTasks(raw)).toEqual({ status: 'corrupt', tasks: [] })
  })

  it('round-trips v2 through the same stable key', () => {
    const values = new Map<string, string>()
    const repository = createRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
    })
    expect(repository.save([task])).toBe(true)
    expect(JSON.parse(values.get(STORAGE_KEY)!).version).toBe(SCHEMA_VERSION)
    expect(repository.read()).toEqual({ status: 'saved', tasks: [task], version: 2 })
  })

  it('allows empty descriptions and exact size boundaries', () => {
    expect(
      decodeTasks(JSON.stringify({ version: 2, tasks: [{ ...task, description: '' }] })).status,
    ).toBe('saved')
    expect(
      decodeTasks(
        JSON.stringify({
          version: 2,
          tasks: [{ ...task, title: 'x'.repeat(300), description: 'y'.repeat(2000) }],
        }),
      ).status,
    ).toBe('saved')
  })

  it('handles blocked access, failed reads and quota errors', () => {
    const unavailable = createRepository(null)
    expect(unavailable.read().status).toBe('memory')
    expect(unavailable.save([])).toBe(false)
    const blocked = createRepository({
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(blocked.read().status).toBe('memory')
    expect(blocked.save([task])).toBe(false)
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('SecurityError')
      },
    })
    expect(getBrowserStorage()).toBeNull()
    const backend = { getItem: vi.fn(), setItem: vi.fn() }
    vi.stubGlobal('window', { localStorage: backend })
    expect(getBrowserStorage()).toBe(backend)
  })
})
