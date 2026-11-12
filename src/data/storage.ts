import { MAX_TASK_LENGTH, MAX_DESCRIPTION_LENGTH, isValidTaskId, type Task } from '../domain/tasks'

export const STORAGE_KEY = 'po-delu:tasks:v1'
export const SCHEMA_VERSION = 3

export type StorageBackend = Pick<Storage, 'getItem' | 'setItem'>
export type ReadResult =
  | { status: 'saved'; tasks: readonly Task[]; trash: readonly Task[]; version: 1 | 2 | 3 | null }
  | { status: 'corrupt' | 'memory'; tasks: readonly Task[]; trash: readonly Task[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeTasks(raw: string | null): ReadResult {
  if (raw === null) return { status: 'saved', tasks: [], trash: [], version: null }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== 2 && value.version !== SCHEMA_VERSION) ||
      !Array.isArray(value.tasks) ||
      (value.version === 3 && !Array.isArray(value.trash))
    )
      throw new Error('Invalid schema')
    const version = value.version
    const ids = new Set<string>()
    function parseTask(item: unknown): Task {
      if (!isRecord(item)) throw new Error('Invalid task')
      const title = version === 1 ? item.text : item.title
      const description = version === 1 ? '' : item.description
      if (
        typeof item.id !== 'string' ||
        !isValidTaskId(item.id) ||
        ids.has(item.id) ||
        typeof title !== 'string' ||
        !title.trim() ||
        title.trim().length > MAX_TASK_LENGTH ||
        typeof description !== 'string' ||
        description.trim().length > MAX_DESCRIPTION_LENGTH ||
        typeof item.done !== 'boolean'
      )
        throw new Error('Invalid task')
      ids.add(item.id)
      return { id: item.id, title: title.trim(), description: description.trim(), done: item.done }
    }
    const tasks = value.tasks.map(parseTask)
    const trash = value.version === 3 ? (value.trash as unknown[]).map(parseTask) : []
    return { status: 'saved', tasks, trash, version: value.version }
  } catch {
    return { status: 'corrupt', tasks: [], trash: [] }
  }
}

export function createRepository(backend: StorageBackend | null) {
  return {
    read(): ReadResult {
      try {
        return backend
          ? decodeTasks(backend.getItem(STORAGE_KEY))
          : { status: 'memory', tasks: [], trash: [] }
      } catch {
        return { status: 'memory', tasks: [], trash: [] }
      }
    },
    save(tasks: readonly Task[], trash: readonly Task[] = []): boolean {
      try {
        if (!backend) return false
        backend.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, tasks, trash }))
        return true
      } catch {
        return false
      }
    },
  }
}

export function getBrowserStorage(): StorageBackend | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
