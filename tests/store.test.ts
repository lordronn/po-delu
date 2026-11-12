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
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
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
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
    store.dispatch({ type: 'toggle', id: 'a' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]?.done).toBe(true)
    store.dispatch({ type: 'delete', id: 'a' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks).toEqual([])
    store.dispatch({ type: 'undo' })
    expect(createTaskStore(storage.backend).getSnapshot().tasks).toEqual([
      { id: 'a', title: 'Task', description: '', done: true },
    ])
    expect(store.getSnapshot().announcement).toBe('Задача восстановлена.')
  })

  it('preserves a corrupt record through edits until explicit recovery', () => {
    const storage = fakeStorage('{broken')
    const store = createTaskStore(storage.backend)
    expect(store.getSnapshot().persistence).toBe('corrupt')
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
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
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
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
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
    store.recover()
    expect(store.getSnapshot().persistence).toBe('memory')
    expect(store.getSnapshot().tasks).toHaveLength(1)
  })

  it('never echoes external updates; they clear undo and can recover corrupt mode', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
    store.dispatch({ type: 'delete', id: 'a' })
    store.receive('{broken')
    expect(store.getSnapshot().deleted).toBeNull()
    expect(store.getSnapshot().persistence).toBe('corrupt')
    expect(storage.writes()).toBe(2)
    store.receive(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'c', title: 'External', description: '', done: true }],
      }),
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
    store.dispatch({ type: 'add', id: 'local', title: 'Unsaved', description: '' })
    const external = JSON.stringify({
      version: 2,
      tasks: [{ id: 'remote', title: 'Remote', description: '', done: false }],
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
      title: 'Unsaved',
      description: '',
      done: true,
    })
  })

  it('protects an unsaved deletion even when the local list is empty', () => {
    const original = JSON.stringify({
      version: 2,
      tasks: [{ id: 'a', title: 'Task', description: '', done: false }],
    })
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
    store.dispatch({ type: 'add', id: 'a', title: 'Unsaved', description: '' })
    store.receive(null)
    expect(store.getSnapshot().persistence).toBe('conflict')
    expect(store.getSnapshot().tasks).toHaveLength(1)
    expect(storage.raw()).toBe('{broken')
  })

  it('ignores equivalent external lists, but resolves an unsaved list if it matches', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
    const current = store.getSnapshot()
    store.receive(storage.raw())
    expect(store.getSnapshot()).toBe(current)
    storage.fail(true)
    store.dispatch({ type: 'toggle', id: 'a' })
    const unsavedTasks = store.getSnapshot().tasks
    store.receive(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'a', title: 'Task', description: '', done: true }],
      }),
    )
    expect(store.getSnapshot().tasks).toBe(unsavedTasks)
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(store.getSnapshot().tasks[0]?.done).toBe(true)
  })
})

describe('v2 persistence and concurrent schema versions', () => {
  it('does not write migration at startup; first edit writes v2 and move persists order', () => {
    const original = JSON.stringify({
      version: 1,
      tasks: [
        { id: 'a', text: 'Legacy', done: true },
        { id: 'b', text: 'Second', done: false },
      ],
    })
    const storage = fakeStorage(original)
    const store = createTaskStore(storage.backend)
    expect(storage.raw()).toBe(original)
    expect(storage.writes()).toBe(0)
    store.dispatch({
      type: 'update',
      id: 'a',
      title: 'Updated',
      description: 'Details\nSecond line',
    })
    expect(JSON.parse(storage.raw()!).version).toBe(2)
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]).toEqual({
      id: 'a',
      title: 'Updated',
      description: 'Details\nSecond line',
      done: true,
    })
    store.dispatch({ type: 'move', id: 'a', overId: 'b' })
    expect(
      createTaskStore(storage.backend)
        .getSnapshot()
        .tasks.map((task) => task.id),
    ).toEqual(['b', 'a'])
    expect(store.getSnapshot().announcement).toContain('позицию 2 из 2')
    const snapshot = store.getSnapshot()
    store.dispatch({ type: 'move', id: 'a', overId: 'a' })
    expect(store.getSnapshot()).toBe(snapshot)
  })

  it('protects v2 descriptions if an already-open v1 tab writes its old schema', () => {
    const storage = fakeStorage(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'a', title: 'Title', description: 'Must survive', done: true }],
      }),
    )
    const store = createTaskStore(storage.backend)
    store.receive(JSON.stringify({ version: 1, tasks: [{ id: 'a', text: 'Title', done: true }] }))
    expect(store.getSnapshot().persistence).toBe('outdated')
    expect(store.getSnapshot().tasks[0]?.description).toBe('Must survive')
    store.dispatch({ type: 'toggle', id: 'a' })
    expect(storage.writes()).toBe(0)
    store.recover()
    expect(store.getSnapshot().persistence).toBe('saved')
    expect(createTaskStore(storage.backend).getSnapshot().tasks[0]?.description).toBe(
      'Must survive',
    )
  })

  it('accepts v1 updates before seeing v2, and notices v2 from another tab', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    const old = JSON.stringify({ version: 1, tasks: [{ id: 'a', text: 'Legacy', done: true }] })
    store.receive(old)
    expect(store.getSnapshot().tasks[0]?.title).toBe('Legacy')
    expect(store.getSnapshot().persistence).toBe('saved')
    store.receive(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'a', title: 'Legacy', description: 'Details', done: true }],
      }),
    )
    store.receive(old)
    expect(store.getSnapshot().persistence).toBe('outdated')
  })

  it('compares descriptions, edits and order when receiving external lists', () => {
    const storage = fakeStorage()
    const store = createTaskStore(storage.backend)
    store.dispatch({ type: 'add', id: 'a', title: 'Task', description: '' })
    store.receive(
      JSON.stringify({
        version: 2,
        tasks: [{ id: 'a', title: 'Task', description: 'New description', done: false }],
      }),
    )
    expect(store.getSnapshot().tasks[0]?.description).toBe('New description')
    expect(storage.writes()).toBe(1)
  })
})
