import { describe, expect, it } from 'vitest'
import {
  MAX_TASK_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  reduceTasks,
  validateText,
  validateDescription,
  type TaskState,
} from '../src/domain/tasks'

const empty: TaskState = { tasks: [], deleted: null }
const populated: TaskState = {
  tasks: [
    { id: 'a', title: 'Первое', description: '', done: false },
    { id: 'b', title: 'Второе', description: '', done: true },
    { id: 'c', title: 'Третье', description: '', done: false },
  ],
  deleted: null,
}

describe('task transitions', () => {
  it.each(['', ' ', '\n\t', 'a'.repeat(MAX_TASK_LENGTH + 1)])('rejects invalid text %j', (text) => {
    expect(validateText(text)).not.toBeNull()
    expect(reduceTasks(empty, { type: 'add', id: 'a', title: text, description: '' })).toBe(empty)
  })

  it('accepts the boundary and trims before validating', () => {
    expect(validateText('a'.repeat(MAX_TASK_LENGTH))).toBeNull()
    expect(validateText(` ${'a'.repeat(MAX_TASK_LENGTH)} `)).toBeNull()
  })

  it('adds at the front, trims, allows repeated text and never mutates input', () => {
    const next = reduceTasks(populated, {
      type: 'add',
      id: 'new',
      title: '  Первое  ',
      description: '',
    })
    expect(next.tasks[0]).toEqual({ id: 'new', title: 'Первое', description: '', done: false })
    expect(next.tasks).toHaveLength(4)
    expect(populated.tasks).toHaveLength(3)
    expect(next.tasks[1]).toBe(populated.tasks[0])
  })

  it.each(['', '  ', 'a', ' a', 'a b', 'a\tb'])(
    'rejects empty, whitespace or duplicate id %j',
    (id) => {
      expect(reduceTasks(populated, { type: 'add', id, title: 'Task', description: '' })).toBe(
        populated,
      )
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
    expect(removed.deleted).toEqual({
      task: populated.tasks[1],
      index: 1,
      beforeId: 'a',
      afterId: 'c',
    })
    expect(reduceTasks(removed, { type: 'undo' })).toEqual(populated)
  })

  it('keeps only the most recent deletion; add and toggle preserve undo', () => {
    let state = reduceTasks(populated, { type: 'delete', id: 'a' })
    state = reduceTasks(state, { type: 'delete', id: 'b' })
    state = reduceTasks(state, { type: 'add', id: 'new', title: 'Новое', description: '' })
    state = reduceTasks(state, { type: 'toggle', id: 'c' })
    expect(state.deleted?.task.id).toBe('b')
    const restored = reduceTasks(state, { type: 'undo' })
    expect(restored.deleted).toBeNull()
    expect(restored.tasks.some((task) => task.id === 'a')).toBe(false)
    expect(restored.tasks.some((task) => task.id === 'b')).toBe(true)
    expect(restored.tasks.map((task) => task.id)).toEqual(['new', 'b', 'c'])
  })

  it('clamps stale undo positions and avoids duplicate ids', () => {
    const task = { id: 'x', title: 'Task', description: '', done: false }
    expect(
      reduceTasks(
        { tasks: [], deleted: { task, index: 20, beforeId: null, afterId: null } },
        { type: 'undo' },
      ).tasks,
    ).toEqual([task])
    expect(
      reduceTasks(
        { tasks: [task], deleted: { task, index: 0, beforeId: null, afterId: null } },
        { type: 'undo' },
      ),
    ).toEqual({
      tasks: [task],
      deleted: null,
    })
  })

  it('validates the description, normalizes its edges and preserves newlines', () => {
    expect(validateDescription('')).toBeNull()
    expect(validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH))).toBeNull()
    expect(validateDescription('a'.repeat(MAX_DESCRIPTION_LENGTH + 1))).not.toBeNull()
    expect(
      reduceTasks(empty, { type: 'add', id: 'new', title: 'Title', description: 'a'.repeat(2001) }),
    ).toBe(empty)
    const result = reduceTasks(empty, {
      type: 'add',
      id: 'new',
      title: 'Title',
      description: '  First\nSecond  ',
    })
    expect(result.tasks[0]?.description).toBe('First\nSecond')
  })

  it('edits both fields while preserving id, done and position', () => {
    const result = reduceTasks(populated, {
      type: 'update',
      id: 'b',
      title: '  Updated  ',
      description: ' Details ',
    })
    expect(result.tasks[1]).toEqual({
      id: 'b',
      title: 'Updated',
      description: 'Details',
      done: true,
    })
    expect(populated.tasks[1]?.title).toBe('Второе')
    expect(
      reduceTasks(populated, { type: 'update', id: 'missing', title: 'Other', description: '' }),
    ).toBe(populated)
    expect(
      reduceTasks(populated, { type: 'update', id: 'b', title: ' Второе ', description: '' }),
    ).toBe(populated)
    expect(reduceTasks(populated, { type: 'update', id: 'b', title: '', description: '' })).toBe(
      populated,
    )
    expect(
      reduceTasks(populated, {
        type: 'update',
        id: 'b',
        title: 'Title',
        description: 'a'.repeat(2001),
      }),
    ).toBe(populated)
  })

  it('moves by stable ids in either direction without mutating tasks', () => {
    const moved = reduceTasks(populated, { type: 'move', id: 'a', overId: 'c' })
    expect(moved.tasks.map((task) => task.id)).toEqual(['b', 'c', 'a'])
    expect(moved.tasks[2]).toBe(populated.tasks[0])
    expect(reduceTasks(moved, { type: 'move', id: 'a', overId: 'b' })).toEqual(populated)
    for (const action of [
      { type: 'move', id: 'missing', overId: 'b' },
      { type: 'move', id: 'a', overId: 'missing' },
      { type: 'move', id: 'a', overId: 'a' },
    ] as const) {
      expect(reduceTasks(populated, action)).toBe(populated)
    }
  })

  it('undo follows surviving neighbors after reorder, then falls back to its old position', () => {
    const removed = reduceTasks(populated, { type: 'delete', id: 'b' })
    const reordered = reduceTasks(removed, { type: 'move', id: 'c', overId: 'a' })
    expect(reduceTasks(reordered, { type: 'undo' }).tasks.map((task) => task.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    const last = reduceTasks(populated, { type: 'delete', id: 'c' })
    expect(reduceTasks(last, { type: 'undo' })).toEqual(populated)
  })
})
