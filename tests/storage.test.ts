import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRepository, decodeTasks, getBrowserStorage, STORAGE_KEY } from '../src/data/storage'

const task = { id: 'a', text: 'Задача', done: false }

afterEach(() => vi.unstubAllGlobals())

describe('storage boundary', () => {
  it('treats missing data as an empty list', () => {
    expect(decodeTasks(null)).toEqual({ status: 'saved', tasks: [] })
  })

  it('ignores unknown fields and normalizes text', () => {
    expect(
      decodeTasks(
        JSON.stringify({
          version: 1,
          extra: true,
          tasks: [{ ...task, text: ' Задача ', unexpected: 'field' }],
        }),
      ),
    ).toEqual({ status: 'saved', tasks: [task] })
  })

  it.each([
    '{bad',
    '',
    'null',
    '[]',
    'true',
    '{}',
    JSON.stringify({ version: 2, tasks: [] }),
    JSON.stringify({ version: 1, tasks: {} }),
    ...[
      null,
      [],
      {},
      { ...task, id: '' },
      { ...task, id: ' ' },
      { ...task, id: 'a b' },
      { ...task, id: ' a' },
      { ...task, id: 1 },
      { ...task, text: '' },
      { ...task, text: '  ' },
      { ...task, text: 1 },
      { ...task, text: 'x'.repeat(301) },
      { ...task, done: 1 },
      { ...task, done: null },
    ].map((item) => JSON.stringify({ version: 1, tasks: [item] })),
    JSON.stringify({ version: 1, tasks: [task, task] }),
  ])('rejects malformed or unsupported records: %s', (raw) => {
    expect(decodeTasks(raw)).toEqual({ status: 'corrupt', tasks: [] })
  })

  it('round-trips through the adapter using the versioned key', () => {
    const values = new Map<string, string>()
    const repository = createRepository({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value)
      },
    })
    expect(repository.save([task])).toBe(true)
    expect(values.has(STORAGE_KEY)).toBe(true)
    expect(repository.read()).toEqual({ status: 'saved', tasks: [task] })
  })

  it('handles blocked storage access, failed reads and write quota', () => {
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
