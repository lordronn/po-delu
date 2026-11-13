import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, CheckCheck, ListTodo, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import type { Task } from '@/domain/tasks'
import { TaskComposer } from '@/components/task-composer'
import { SortableTaskList } from '@/components/sortable-task-list'
import { TaskTrash } from '@/components/task-trash'
import { TaskEditor } from '@/components/task-editor'
import { STORAGE_KEY, type StorageBackend } from '@/data/storage'
import type { TaskStore } from '@/app/task-store'

interface AppProps {
  store: TaskStore
  backend: StorageBackend | null
}

const storageMessages = {
  outdated: {
    title: 'В другой вкладке открыта старая версия',
    description:
      'Она записала список в старом формате. Текущий список и корзина оставлены здесь, чтобы не потерять данные. Обновите остальные вкладки, затем сохраните этот список. При обновлении текущей страницы несохранённые изменения потеряются.',
    button: 'Сохранить текущий список',
  },
  corrupt: {
    title: 'Сохранённые данные не удалось прочитать',
    description:
      'Исходная запись сохранена без изменений. Сейчас список работает только в этой вкладке и потеряется при обновлении страницы.',
    button: 'Сохранить текущий список',
  },
  memory: {
    title: 'Задачи пока не сохраняются',
    description:
      'Список доступен в этой вкладке, но изменения потеряются при обновлении страницы. Проверьте разрешения браузера или свободное место.',
    button: 'Повторить сохранение',
  },
  conflict: {
    title: 'В другой вкладке есть изменения',
    description:
      'Ваши несохранённые изменения оставлены здесь. Сохранение текущего списка заменит список другой вкладки. Чтобы открыть сохранённый список, обновите страницу; несохранённые изменения будут потеряны.',
    button: 'Сохранить текущий список',
  },
}

export default function App({ store, backend }: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { tasks, trash, persistence } = snapshot
  const [editing, setEditing] = useState<Task | null>(null)
  const [dragNotice, setDragNotice] = useState<string | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const preventFocusScroll = useRef(false)
  const done = tasks.filter((task) => task.done).length
  const remaining = tasks.length - done

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.storageArea !== backend || (event.key !== STORAGE_KEY && event.key !== null)) return
      const active = document.activeElement
      const focusedTrashToggle = active?.id === 'trash-toggle'
      const focusedRecovery = !!active?.closest('.storage-alert')
      const focusedTrash = active?.closest('[data-trash-id]')?.getAttribute('data-trash-id')
      const focusedRow = active?.closest('[data-task-id]')?.getAttribute('data-task-id')
      store.receive(event.newValue)
      const next = store.getSnapshot()
      if (
        (focusedRow && !next.tasks.some((task) => task.id === focusedRow)) ||
        (focusedTrashToggle && next.trash.length === 0) ||
        (focusedRecovery && next.persistence === 'saved')
      )
        pendingFocus.current = 'new-task'
      if (focusedTrash && !next.trash.some((task) => task.id === focusedTrash))
        pendingFocus.current = next.trash.length ? 'trash-toggle' : 'new-task'
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store, backend])

  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const element = document.getElementById(target) ?? document.getElementById('new-task')
    element?.focus({ preventScroll: preventFocusScroll.current })
    preventFocusScroll.current = false
  }, [snapshot])

  function toggleTask(id: string) {
    const index = tasks.findIndex((task) => task.id === id)
    const task = tasks[index]
    if (!task) return
    const moves = task.done ? index !== 0 : index !== tasks.length - 1
    const neighbor = moves ? (tasks[index + 1] ?? tasks[index - 1] ?? task) : task
    pendingFocus.current = `task-${neighbor.id}`
    preventFocusScroll.current = true
    store.dispatch({ type: 'toggle', id })
  }

  function removeTask(task: Task, index: number) {
    const neighbor = tasks[index + 1] ?? tasks[index - 1]
    pendingFocus.current = neighbor ? `task-${neighbor.id}` : 'new-task'
    store.dispatch({ type: 'delete', id: task.id })
  }

  function restoreTask(id: string) {
    const current = store.getSnapshot()
    if (!current.trash.some((task) => task.id === id)) return
    pendingFocus.current = `task-${id}`
    store.dispatch(current.deleted?.task.id === id ? { type: 'undo' } : { type: 'restore', id })
  }

  function purgeTask(task: Task) {
    if (
      !window.confirm(`Удалить задачу «${task.title}» окончательно? Восстановить её будет нельзя.`)
    )
      return
    const current = store.getSnapshot().trash
    const index = current.findIndex((item) => item.id === task.id)
    if (index < 0) return
    const neighbor = current[index + 1] ?? current[index - 1]
    pendingFocus.current = neighbor ? `restore-${neighbor.id}` : 'new-task'
    store.dispatch({ type: 'purge', id: task.id })
  }

  function moveTask(id: string, overId: string, expected?: readonly Task[]) {
    const current = store.getSnapshot().tasks
    if (expected && current !== expected) {
      setDragNotice('Список изменился во время переноса. Порядок не изменён — повторите перенос.')
      return
    }
    if (
      id === overId ||
      !current.some((task) => task.id === id) ||
      !current.some((task) => task.id === overId)
    )
      return
    setDragNotice(null)
    pendingFocus.current = `drag-${id}`
    store.dispatch({ type: 'move', id, overId })
  }

  function saveEdit(base: Task, title: string, description: string, asNew: boolean): boolean {
    const current = store.getSnapshot().tasks.find((task) => task.id === base.id)
    if (
      !asNew &&
      (!current || current.title !== base.title || current.description !== base.description)
    )
      return false
    store.dispatch({
      type: asNew ? 'add' : 'update',
      id: asNew ? crypto.randomUUID() : base.id,
      title,
      description,
    })
    setEditing(null)
    return true
  }

  function recoverStorage() {
    if (
      persistence === 'corrupt' &&
      !window.confirm(
        'Заменить повреждённую запись текущим списком? Исходная запись будет перезаписана.',
      )
    )
      return
    if (
      (persistence === 'conflict' || persistence === 'outdated') &&
      !window.confirm(
        'Заменить список другой вкладки текущим? Сохранённый список будет перезаписан.',
      )
    )
      return
    pendingFocus.current = 'new-task'
    store.recover()
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Перейти к списку задач
      </a>
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark">
            <Check aria-hidden="true" size={22} strokeWidth={2.6} />
          </span>
          <span>
            по делу<span className="brand-dot">.</span>
          </span>
        </div>
      </header>

      <main id="main" className="main-content" tabIndex={-1}>
        <section className="intro" aria-labelledby="page-title">
          <h1 id="page-title">Мои задачи</h1>
          <span className="remaining-count">Осталось: {remaining}</span>
        </section>

        {persistence !== 'saved' && (
          <Alert className="storage-alert" variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{storageMessages[persistence].title}</AlertTitle>
            <AlertDescription>
              <p>{storageMessages[persistence].description}</p>
              <Button variant="outline" size="sm" onClick={recoverStorage}>
                <RotateCcw aria-hidden="true" /> {storageMessages[persistence].button}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="task-workspace">
          <TaskComposer
            onAdd={(title, description) =>
              store.dispatch({ type: 'add', id: crypto.randomUUID(), title, description })
            }
          />

          <section className="list-section" aria-labelledby="list-title">
            <div className="list-heading">
              <h2 id="list-title">
                Все задачи <span className="sr-only">{tasks.length}</span>
              </h2>
            </div>
            {tasks.length === 0 ? (
              <div className="empty-state">
                <ListTodo size={25} strokeWidth={1.5} aria-hidden="true" />
                <h3>Пока нет задач</h3>
                <p>Добавьте первое дело в поле выше.</p>
              </div>
            ) : (
              <SortableTaskList
                tasks={tasks}
                onToggle={toggleTask}
                onDelete={removeTask}
                onEdit={setEditing}
                onMove={moveTask}
              />
            )}
            {tasks.length > 0 && done === tasks.length && (
              <div className="all-done">
                <CheckCheck size={17} aria-hidden="true" /> Всё готово. Можно выдохнуть.
              </div>
            )}
          </section>

          <TaskTrash tasks={trash} onRestore={restoreTask} onPurge={purgeTask} />

          <div className="card-footer">
            <CheckCheck size={14} aria-hidden="true" />
            <span>
              {persistence === 'saved'
                ? 'Сохранено в этом браузере'
                : 'Изменения хранятся только в памяти вкладки'}
            </span>
          </div>
        </div>

        {dragNotice && (
          <p className="drag-notice" role="status">
            {dragNotice}
          </p>
        )}
        {editing && (
          <TaskEditor
            key={editing.id}
            initial={editing}
            current={tasks.find((task) => task.id === editing.id)}
            onSave={saveEdit}
            onClose={() => setEditing(null)}
          />
        )}

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          <span key={snapshot.revision}>{snapshot.announcement}</span>
        </div>
      </main>
    </div>
  )
}
