import { reduceTasks, type TaskAction, type TaskState, type Task } from '../domain/tasks'
import { createRepository, decodeTasks, SCHEMA_VERSION, type StorageBackend } from '../data/storage'

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
    trash: initial.trash,
    deleted: null,
    persistence: initial.status,
    announcement: '',
    revision: 0,
  }
  const listeners = new Set<() => void>()
  let hasUnsavedChanges = false
  let highestVersion = initial.status === 'saved' ? (initial.version ?? 0) : 0

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
          : repository.save(next.tasks, next.trash)
            ? 'saved'
            : 'memory'
      const announcement =
        action.type === 'add'
          ? 'Задача добавлена.'
          : action.type === 'purge'
            ? 'Задача удалена окончательно.'
            : action.type === 'delete'
              ? 'Задача перемещена в корзину.'
              : action.type === 'undo' || action.type === 'restore'
                ? 'Задача восстановлена.'
                : action.type === 'update'
                  ? 'Задача изменена.'
                  : action.type === 'move'
                    ? `Задача перемещена на позицию ${next.tasks.findIndex((task) => task.id === action.id) + 1} из ${next.tasks.length}.`
                    : next.tasks.find((task) => task.id === action.id)?.done
                      ? snapshot.tasks.at(-1)?.id === action.id
                        ? 'Задача выполнена.'
                        : 'Задача выполнена и перемещена в конец списка.'
                      : snapshot.tasks[0]?.id === action.id
                        ? 'Задача возвращена в работу.'
                        : 'Задача возвращена в работу и перемещена в начало списка.'
      hasUnsavedChanges = persistence !== 'saved'
      if (!hasUnsavedChanges) highestVersion = SCHEMA_VERSION
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
      if (external.version !== null && external.version < highestVersion) {
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
      highestVersion = Math.max(highestVersion, external.version ?? 0)
      const sameTasks = equalTasks(external.tasks, snapshot.tasks)
      const sameTrash = equalTasks(external.trash, snapshot.trash)
      const matches = sameTasks && sameTrash
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
        tasks: sameTasks ? snapshot.tasks : external.tasks,
        trash: sameTrash ? snapshot.trash : external.trash,
        deleted: null,
        persistence: 'saved',
        announcement: 'Список обновлён в другой вкладке.',
      })
    },
    recover() {
      const saved = repository.save(snapshot.tasks, snapshot.trash)
      hasUnsavedChanges = !saved
      if (saved) highestVersion = SCHEMA_VERSION
      publish({
        ...snapshot,
        persistence: saved ? 'saved' : 'memory',
        announcement: saved ? 'Текущий список сохранён.' : 'Не удалось сохранить список.',
      })
    },
  }
}

export type TaskStore = ReturnType<typeof createTaskStore>

function equalTasks(first: readonly Task[], second: readonly Task[]): boolean {
  return (
    first.length === second.length &&
    first.every((task, index) => {
      const other = second[index]
      return (
        other?.id === task.id &&
        other.title === task.title &&
        other.description === task.description &&
        other.done === task.done
      )
    })
  )
}
