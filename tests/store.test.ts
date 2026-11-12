import { describe, expect, it } from 'vitest'
import { createTaskStore } from '../src/app/task-store'
import { STORAGE_KEY, type StorageBackend } from '../src/data/storage'

function fakeStorage(initial: string | null = null) {
  let raw = initial
  let writes = 0
  let fail = false
  const backend: StorageBackend = {
    getItem: () => raw,
    setItem: (key, value) => {
      expect(key).toBe(STORAGE_KEY)
      if (fail) throw new Error('Quota exceeded')
      raw = value
      writes++
    },
  }
  return {
    backend,
    raw: () => raw,
    writes: () => writes,
    fail: (value: boolean) => {
      fail = value
    },
  }
}

describe('task store', () => {
  it('has a stable snapshot and does not write on initialization or subscription', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    expect(store.getSnapshot()).toBe(store.getSnapshot())
    let notifications = 0
    const unsubscribe = store.subscribe(() => notifications++)
    expect(storage.writes()).toBe(0)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    expect(notifications).toBe(1)
    expect(storage.writes()).toBe(1)
    expect(store.getSnapshot().announcement).toBe('Задача добавлена.')
    unsubscribe()
    store.dispatch({ type: 'toggle', id: 'a' })
    expect(notifications).toBe(1)
    expect(store.getSnapshot().announcement).toBe('')
    const current = store.getSnapshot()
    store.dispatch({ type: 'toggle', id: 'missing' })
    expect(store.getSnapshot()).toBe(current)
    expect(storage.writes()).toBe(2)
  })

  it('persists add, toggle, delete and undo across reconstructed stores', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    store.dispatch({ type: 'toggle', id: 'a' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]?.done).toBe(true)
    store.dispatch({ type: 'delete', id: 'a' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks).toEqual([])
    store.dispatch({ type: 'undo' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks).toEqual([
      { id: 'a', text: 'Task', done: true },
    ])
    expect(store.getSnapshot().announcement).toBe('Задача восстановлена.')
  })

  it('preserves a corrupt record through edits until explicit recovery', () => {
    const storage = fakeStorage('{broken')
    const store = createTaskStore(storage.backend)
    expect(store.getSnapshot().persistence).toBe('corrupt')
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    expect(store.getSnapshot().tasks).toHaveLength(1)
    expect(storage.raw()).toBe('{broken')
    expect(storage.writes()).toBe(0)
    store.recover()
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(createTaskStore(storage.backend).getSnapshot().tasks).toHaveLength(1)
  })

  it('keeps edits in memory on quota error and retries on next mutation', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    storage.fail(true)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    expect(store.getSnapshot().persistence).toBe('memory')
    expect(store.getSnapshot().tasks).toHaveLength(1)
    store.recover()
    expect(store.getSnapshot().persistence).toBe('memory')
    storage.fail(false)
    store.dispatch({ type: 'toggle', id: 'a' })
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]?.done).toBe(true)
  })

  it('works when storage is entirely unavailable', () => {
    const store = createTaskStore(null)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    store.recover()
    expect(store.getSnapshot().persistence).toBe('memory')
    expect(store.getSnapshot().tasks).toHaveLength(1)
  })

  it('never echoes external updates; they clear undo and can recover corrupt mode', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    store.dispatch({ type: 'delete', id: 'a' })
    store.receive('{broken')
    expect(store.getSnapshot().deleted).toBeNull()
    expect(store.getSnapshot().persistence).toBe('corrupt')
    expect(storage.writes()).toBe(2)
    store.receive(
      JSON.stringify({ version: 1, tasks: [{ id: 'c', text: 'External', done: true }] }),
    )
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(store.getSnapshot().tasks[0]?.id).toBe('c')
    expect(storage.writes()).toBe(2)
    store.receive(null)
    expect(store.getSnapshot().tasks).toEqual([])
  })

  it('preserves unsaved edits when a different valid external list arrives', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    storage.fail(true)
    store.dispatch({ type: 'add', id: 'local', text: 'Unsaved' })
    const external = JSON.stringify({
      version: 1,
      tasks: [{ id: 'remote', text: 'Remote', done: false }],
    })
    store.receive(external)
    expect(store.getSnapshot().persistence).toBe('conflict')
    expect(store.getSnapshot().tasks[0]?.id).toBe('local')
    store.dispatch({ type: 'toggle', id: 'local' })
    expect(storage.writes()).toBe(0)
    storage.fail(false)
    store.recover()
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]).toEqual({
      id: 'local',
      text: 'Unsaved',
      done: true,
    })
  })

  it('protects an unsaved deletion even when the local list is empty', () => {
    const original = JSON.stringify({ version: 1, tasks: [{ id: 'a', text: 'Task', done: false }] })
    const storage = fakeStorage(original)
    const store = createTaskStore(storage.backend)
    storage.fail(true)
    store.dispatch({ type: 'delete', id: 'a' })
    store.receive(original)
    expect(store.getSnapshot().persistence).toBe('conflict')
    expect(store.getSnapshot().tasks).toEqual([])
    expect(store.getSnapshot().deleted).toBeNull()
    expect(storage.raw()).toBe(original)
  })

  it('does not replace unsaved edits made while data was corrupt', () => {
    const storage = fakeStorage('{broken')
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', text: 'Unsaved' })
    store.receive(null)
    expect(store.getSnapshot().persistence).toBe('conflict')
    expect(store.getSnapshot().tasks).toHaveLength(1)
    expect(storage.raw()).toBe('{broken')
  })

  it('ignores equivalent external lists, but resolves an unsaved list if it matches', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', text: 'Task' })
    const current = store.getSnapshot()
    store.receive(storage.raw())
    expect(store.getSnapshot()).toBe(current)
    storage.fail(true)
    store.dispatch({ type: 'toggle', id: 'a' })
    store.receive(JSON.stringify({ version: 1, tasks: [{ id: 'a', text: 'Task', done: true }] }))
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(store.getSnapshot().tasks[0]?.done).toBe(true)
  })
})
