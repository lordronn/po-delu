export const MAX_TASK_LENGTH = 300

export function isValidTaskId(id: string): boolean {
  return id.length > 0 && !/\s/u.test(id)
}

export interface Task {
  readonly id: string
  readonly text: string
  readonly done: boolean
}

export interface DeletedTask {
  readonly task: Task
  readonly index: number
}

export interface TaskState {
  readonly tasks: readonly Task[]
  readonly deleted: DeletedTask | null
}

export type TaskAction =
  | { type: 'add'; id: string; text: string }
  | { type: 'toggle'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'undo' }

export function validateText(value: string): string | null {
  if (!value.trim()) return 'Напишите, что нужно сделать.'
  if (value.trim().length > MAX_TASK_LENGTH) return `Не больше ${MAX_TASK_LENGTH} символов.`
  return null
}

export function reduceTasks(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case 'add': {
      if (validateText(action.text)) return state
      if (!isValidTaskId(action.id) || state.tasks.some((task) => task.id === action.id))
        return state
      return {
        ...state,
        deleted: state.deleted ? { ...state.deleted, index: state.deleted.index + 1 } : null,
        tasks: [{ id: action.id, text: action.text.trim(), done: false }, ...state.tasks],
      }
    }
    case 'toggle': {
      if (!state.tasks.some((task) => task.id === action.id)) return state
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, done: !task.done } : task,
        ),
      }
    }
    case 'delete': {
      const index = state.tasks.findIndex((task) => task.id === action.id)
      const task = state.tasks[index]
      if (!task) return state
      return {
        tasks: state.tasks.filter((item) => item.id !== action.id),
        deleted: { task, index },
      }
    }
    case 'undo': {
      if (!state.deleted) return state
      const { task, index } = state.deleted
      if (state.tasks.some((item) => item.id === task.id)) return { ...state, deleted: null }
      const tasks = [...state.tasks]
      tasks.splice(Math.min(index, tasks.length), 0, task)
      return { tasks, deleted: null }
    }
  }
}
