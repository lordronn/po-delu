export const MAX_TASK_LENGTH = 300
export const MAX_DESCRIPTION_LENGTH = 2000

export function isValidTaskId(id: string): boolean {
  return id.length > 0 && !/\s/u.test(id)
}

export interface Task {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly done: boolean
}

export interface DeletedTask {
  readonly task: Task
  readonly index: number
  readonly beforeId: string | null
  readonly afterId: string | null
}

export interface TaskState {
  readonly tasks: readonly Task[]
  readonly deleted: DeletedTask | null
}

export type TaskAction =
  | { type: 'add'; id: string; title: string; description: string }
  | { type: 'update'; id: string; title: string; description: string }
  | { type: 'move'; id: string; overId: string }
  | { type: 'toggle'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'undo' }

export function validateText(value: string): string | null {
  if (!value.trim()) return 'Укажите заголовок задачи.'
  if (value.trim().length > MAX_TASK_LENGTH) return `Не больше ${MAX_TASK_LENGTH} символов.`
  return null
}

export function validateDescription(value: string): string | null {
  return value.trim().length > MAX_DESCRIPTION_LENGTH
    ? `В описании должно быть не больше ${MAX_DESCRIPTION_LENGTH} символов.`
    : null
}

export function reduceTasks(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case 'add': {
      if (validateText(action.title) || validateDescription(action.description)) return state
      if (!isValidTaskId(action.id) || state.tasks.some((task) => task.id === action.id))
        return state
      return {
        ...state,
        deleted: state.deleted ? { ...state.deleted, index: state.deleted.index + 1 } : null,
        tasks: [
          {
            id: action.id,
            title: action.title.trim(),
            description: action.description.trim(),
            done: false,
          },
          ...state.tasks,
        ],
      }
    }
    case 'update': {
      if (validateText(action.title) || validateDescription(action.description)) return state
      const current = state.tasks.find((task) => task.id === action.id)
      const title = action.title.trim()
      const description = action.description.trim()
      if (!current || (current.title === title && current.description === description)) return state
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.id ? { ...task, title, description } : task,
        ),
      }
    }
    case 'move': {
      const from = state.tasks.findIndex((task) => task.id === action.id)
      const to = state.tasks.findIndex((task) => task.id === action.overId)
      const task = state.tasks[from]
      if (!task || to < 0 || from === to) return state
      const tasks = [...state.tasks]
      tasks.splice(from, 1)
      tasks.splice(to, 0, task)
      return { ...state, tasks }
    }
    case 'toggle': {
      const current = state.tasks.find((task) => task.id === action.id)
      if (!current) return state
      const toggled = { ...current, done: !current.done }
      const others = state.tasks.filter((task) => task.id !== action.id)
      return { ...state, tasks: toggled.done ? [...others, toggled] : [toggled, ...others] }
    }
    case 'delete': {
      const index = state.tasks.findIndex((task) => task.id === action.id)
      const task = state.tasks[index]
      if (!task) return state
      return {
        tasks: state.tasks.filter((item) => item.id !== action.id),
        deleted: {
          task,
          index,
          beforeId: state.tasks[index - 1]?.id ?? null,
          afterId: state.tasks[index + 1]?.id ?? null,
        },
      }
    }
    case 'undo': {
      if (!state.deleted) return state
      const { task, index, beforeId, afterId } = state.deleted
      if (state.tasks.some((item) => item.id === task.id)) return { ...state, deleted: null }
      const after = state.tasks.findIndex((item) => item.id === afterId)
      const before = state.tasks.findIndex((item) => item.id === beforeId)
      // Prefer the next surviving neighbor, then the previous one, then the old position.
      const position =
        after >= 0 ? after : before >= 0 ? before + 1 : Math.min(index, state.tasks.length)
      const tasks = [...state.tasks]
      tasks.splice(position, 0, task)
      return { tasks, deleted: null }
    }
  }
}
