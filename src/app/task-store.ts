import { reduceTasks, type TaskAction, type TaskState } from '../domain/tasks'
import { createRepository, decodeTasks, type StorageBackend } from '../data/storage'

export interface Snapshot extends TaskState {
  readonly persistence: 'saved' | 'corrupt' | 'memory' | 'conflict' | 'outdated'
  readonly announcement: string
  readonly revision: number
}

// Writes happen only in explicit actions, never in a render or persistence effect.
// React's StrictMode and external storage updates therefore cannot replay writes.
export function createTaskStore(backend: StorageBackend | null) {
  const repository = createRepository(backend)
  const initial = repository.read()
  let snapshot: Snapshot = {
    tasks: initial.tasks,
    deleted: null,
    persistence: initial.status,
    announcement: '',
    revision: 0,
  }
  const listeners = new Set<() => void>()
  let hasUnsavedChanges = false
  let hasSeenV2 = initial.status === 'saved' && initial.version === 2

  function publish(next: Omit<Snapshot, 'revision'>) {
    snapshot = { ...next, revision: snapshot.revision + 1 }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispatch(action: TaskAction) {
      const next = reduceTasks(snapshot, action)
      if (next === snapshot) return
      const persistence =
        snapshot.persistence === 'corrupt' ||
        snapshot.persistence === 'conflict' ||
        snapshot.persistence === 'outdated'
          ? snapshot.persistence
          : repository.save(next.tasks)
            ? 'saved'
            : 'memory'
      const announcement =
        action.type === 'add'
          ? 'Задача добавлена.'
          : action.type === 'delete'
            ? 'Задача удалена. Можно отменить удаление.'
            : action.type === 'undo'
              ? 'Задача восстановлена.'
              : action.type === 'update'
                ? 'Задача изменена.'
                : action.type === 'move'
                  ? `Задача перемещена на позицию ${next.tasks.findIndex((task) => task.id === action.id) + 1} из ${next.tasks.length}.`
                  : ''
      hasUnsavedChanges = persistence !== 'saved'
      if (!hasUnsavedChanges) hasSeenV2 = true
      publish({ ...next, persistence, announcement })
    },
    receive(raw: string | null) {
      const external = decodeTasks(raw)
      if (external.status !== 'saved') {
        publish({
          ...snapshot,
          deleted: null,
          persistence: 'corrupt',
          announcement: 'Сохранённые данные повреждены. Текущий список оставлен в памяти.',
        })
        return
      }
      if (hasSeenV2 && external.version === 1) {
        hasUnsavedChanges = true
        publish({
          ...snapshot,
          deleted: null,
          persistence: 'outdated',
          announcement:
            'Другая вкладка использует старую версию. Текущий список оставлен в памяти.',
        })
        return
      }
      if (external.version === 2) hasSeenV2 = true
      const matches =
        external.tasks.length === snapshot.tasks.length &&
        external.tasks.every((task, index) => {
          const local = snapshot.tasks[index]
          return (
            local?.id === task.id &&
            local.title === task.title &&
            local.description === task.description &&
            local.done === task.done
          )
        })
      if (hasUnsavedChanges && !matches) {
        publish({
          ...snapshot,
          deleted: null,
          persistence: 'conflict',
          announcement: 'В другой вкладке есть изменения. Ваш несохранённый список оставлен здесь.',
        })
        return
      }
      hasUnsavedChanges = false
      if (matches && snapshot.persistence === 'saved') return
      publish({
        tasks: matches ? snapshot.tasks : external.tasks,
        deleted: null,
        persistence: 'saved',
        announcement: 'Список обновлён в другой вкладке.',
      })
    },
    recover() {
      const saved = repository.save(snapshot.tasks)
      hasUnsavedChanges = !saved
      if (saved) hasSeenV2 = true
      publish({
        ...snapshot,
        persistence: saved ? 'saved' : 'memory',
        announcement: saved ? 'Текущий список сохранён.' : 'Не удалось сохранить список.',
      })
    },
  }
}

export type TaskStore = ReturnType<typeof createTaskStore>
