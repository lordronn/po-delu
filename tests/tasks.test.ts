import { describe, expect, it } from 'vitest'
import { MAX_TASK_LENGTH, reduceTasks, validateText, type TaskState } from '../src/domain/tasks'

const empty: TaskState = { tasks: [], deleted: null }
const populated: TaskState = {
  tasks: [
    { id: 'a', text: 'Первое', done: false },
    { id: 'b', text: 'Второе', done: true },
    { id: 'c', text: 'Третье', done: false },
  ],
  deleted: null,
}

describe('task transitions', () => {
  it.each(['', ' ', '\n\t', 'a'.repeat(MAX_TASK_LENGTH + 1)])('rejects invalid text %j', (text) => {
    expect(validateText(text)).not.toBeNull()
    expect(reduceTasks(empty, { type: 'add', id: 'a', text })).toBe(empty)
  })

  it('accepts the boundary and trims before validating', () => {
    expect(validateText('a'.repeat(MAX_TASK_LENGTH))).toBeNull()
    expect(validateText(` ${'a'.repeat(MAX_TASK_LENGTH)} `)).toBeNull()
  })

  it('adds at the front, trims, allows repeated text and never mutates input', () => {
    const next = reduceTasks(populated, { type: 'add', id: 'new', text: '  Первое  ' })
    expect(next.tasks[0]).toEqual({ id: 'new', text: 'Первое', done: false })
    expect(next.tasks).toHaveLength(4)
    expect(populated.tasks).toHaveLength(3)
    expect(next.tasks[1]).toBe(populated.tasks[0])
  })

  it.each(['', '  ', 'a', ' a', 'a b', 'a\tb'])(
    'rejects empty, whitespace or duplicate id %j',
    (id) => {
      expect(reduceTasks(populated, { type: 'add', id, text: 'Task' })).toBe(populated)
    },
  )

  it('toggles twice without moving tasks', () => {
    const next = reduceTasks(populated, { type: 'toggle', id: 'a' })
    expect(next.tasks.map((task) => task.id)).toEqual(['a', 'b', 'c'])
    expect(next.tasks[0]?.done).toBe(true)
    expect(reduceTasks(next, { type: 'toggle', id: 'a' })).toEqual(populated)
    expect(populated.tasks[0]?.done).toBe(false)
  })

  it('unknown ids and an empty undo are referential no-ops', () => {
    expect(reduceTasks(populated, { type: 'toggle', id: 'missing' })).toBe(populated)
    expect(reduceTasks(populated, { type: 'delete', id: 'missing' })).toBe(populated)
    expect(reduceTasks(populated, { type: 'undo' })).toBe(populated)
  })

  it('restores the task at its previous position with its completion state', () => {
    const removed = reduceTasks(populated, { type: 'delete', id: 'b' })
    expect(removed.tasks.map((task) => task.id)).toEqual(['a', 'c'])
    expect(removed.deleted).toEqual({ task: populated.tasks[1], index: 1 })
    expect(reduceTasks(removed, { type: 'undo' })).toEqual(populated)
  })

  it('keeps only the most recent deletion; add and toggle preserve undo', () => {
    let state = reduceTasks(populated, { type: 'delete', id: 'a' })
    state = reduceTasks(state, { type: 'delete', id: 'b' })
    state = reduceTasks(state, { type: 'add', id: 'new', text: 'Новое' })
    state = reduceTasks(state, { type: 'toggle', id: 'c' })
    expect(state.deleted?.task.id).toBe('b')
    const restored = reduceTasks(state, { type: 'undo' })
    expect(restored.deleted).toBeNull()
    expect(restored.tasks.some((task) => task.id === 'a')).toBe(false)
    expect(restored.tasks.some((task) => task.id === 'b')).toBe(true)
    expect(restored.tasks.map((task) => task.id)).toEqual(['new', 'b', 'c'])
  })

  it('clamps stale undo positions and avoids duplicate ids', () => {
    const task = { id: 'x', text: 'Task', done: false }
    expect(
      reduceTasks({ tasks: [], deleted: { task, index: 20 } }, { type: 'undo' }).tasks,
    ).toEqual([task])
    expect(reduceTasks({ tasks: [task], deleted: { task, index: 0 } }, { type: 'undo' })).toEqual({
      tasks: [task],
      deleted: null,
    })
  })
})
