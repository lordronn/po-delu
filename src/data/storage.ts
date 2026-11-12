import { MAX_TASK_LENGTH, isValidTaskId, type Task } from '../domain/tasks'

export const STORAGE_KEY = 'po-delu:tasks:v1'

export type StorageBackend = Pick<Storage, 'getItem' | 'setItem'>
export type ReadResult =
  | { status: 'saved'; tasks: readonly Task[] }
  | { status: 'corrupt' | 'memory'; tasks: readonly Task[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function decodeTasks(raw: string | null): ReadResult {
  if (raw === null) return { status: 'saved', tasks: [] }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tasks))
      throw new Error('Invalid schema')
    const ids = new Set<string>()
    const tasks: Task[] = value.tasks.map((item: unknown) => {
      if (
        !isRecord(item) ||
        typeof item.id !== 'string' ||
        !isValidTaskId(item.id) ||
        ids.has(item.id) ||
        typeof item.text !== 'string' ||
        !item.text.trim() ||
        item.text.trim().length > MAX_TASK_LENGTH ||
        typeof item.done !== 'boolean'
      )
        throw new Error('Invalid task')
      ids.add(item.id)
      return { id: item.id, text: item.text.trim(), done: item.done }
    })
    return { status: 'saved', tasks }
  } catch {
    return { status: 'corrupt', tasks: [] }
  }
}

export function createRepository(backend: StorageBackend | null) {
  return {
    read(): ReadResult {
      try {
        return backend ? decodeTasks(backend.getItem(STORAGE_KEY)) : { status: 'memory', tasks: [] }
      } catch {
        return { status: 'memory', tasks: [] }
      }
    },
    save(tasks: readonly Task[]): boolean {
      try {
        if (!backend) return false
        backend.setItem(STORAGE_KEY, JSON.stringify({ version: 1, tasks }))
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
