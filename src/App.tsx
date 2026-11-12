import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowRight,
  Check,
  CheckCheck,
  ListTodo,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import type { Task } from '@/domain/tasks'
import { TaskComposer } from '@/components/task-composer'
import { SortableTaskList } from '@/components/sortable-task-list'
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
      'Она записала список без описаний. Ваш текущий список оставлен здесь, чтобы не потерять детали. Обновите остальные вкладки, затем сохраните этот список. При обновлении текущей страницы несохранённые детали потеряются.',
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
  const { tasks, deleted, persistence } = snapshot
  const [editing, setEditing] = useState<Task | null>(null)
  const [dragNotice, setDragNotice] = useState<string | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const done = tasks.filter((task) => task.done).length
  const remaining = tasks.length - done

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.storageArea !== backend || (event.key !== STORAGE_KEY && event.key !== null)) return
      const active = document.activeElement
      const focusedUndo = !!active?.closest('.undo-panel')
      const focusedRecovery = !!active?.closest('.storage-alert')
      const focusedRow = active?.closest('[data-task-id]')?.getAttribute('data-task-id')
      store.receive(event.newValue)
      const next = store.getSnapshot()
      if (
        (focusedRow && !next.tasks.some((task) => task.id === focusedRow)) ||
        (focusedUndo && !next.deleted) ||
        (focusedRecovery && next.persistence === 'saved')
      )
        pendingFocus.current = 'new-task'
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [store, backend])

  useLayoutEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    const element = document.getElementById(target) ?? document.getElementById('new-task')
    element?.focus()
  }, [snapshot])

  function removeTask(task: Task, index: number) {
    const neighbor = tasks[index + 1] ?? tasks[index - 1]
    pendingFocus.current = neighbor ? `task-${neighbor.id}` : 'new-task'
    store.dispatch({ type: 'delete', id: task.id })
  }

  function undoDelete() {
    pendingFocus.current = deleted ? `task-${deleted.task.id}` : 'new-task'
    store.dispatch({ type: 'undo' })
  }

  function moveTask(
    id: string,
    overId: string,
    focus: 'drag' | 'buttons',
    expected?: readonly Task[],
  ) {
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
    pendingFocus.current = `${focus === 'drag' ? 'drag' : 'details'}-${id}`
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
        <span className="header-note">
          <LockKeyhole size={13} aria-hidden="true" /> Личное пространство
        </span>
      </header>

      <main id="main" className="main-content" tabIndex={-1}>
        <section className="intro" aria-labelledby="page-title">
          <div className="eyebrow">
            <span aria-hidden="true" /> МЕНЬШЕ ШУМА, БОЛЬШЕ ДЕЛА
          </div>
          <h1 id="page-title">
            Мои задачи<span className="title-dot">.</span>
          </h1>
          <p>Освободите голову. Запишите важное и двигайтесь в своём темпе.</p>
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

        <Card className="task-card">
          <TaskComposer
            onAdd={(title, description) =>
              store.dispatch({ type: 'add', id: crypto.randomUUID(), title, description })
            }
          />

          <section className="list-section" aria-labelledby="list-title">
            <div className="list-heading">
              <h2 id="list-title">
                Ваш список <span className="count-badge">{tasks.length}</span>
              </h2>
              {tasks.length > 0 && (
                <span className="list-summary">
                  Осталось: {remaining}
                  <span aria-hidden="true"> · </span>Готово: {done}
                </span>
              )}
            </div>
            {tasks.length > 1 && (
              <p className="sort-hint">
                Меняйте порядок за ручку ⋮⋮ или кнопками в раскрытой задаче.
              </p>
            )}
            {tasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-illustration" aria-hidden="true">
                  <span className="empty-orbit orbit-one" />
                  <span className="empty-orbit orbit-two" />
                  <div className="empty-icon">
                    <ListTodo size={32} strokeWidth={1.6} />
                  </div>
                  <span className="empty-check">
                    <Check size={13} strokeWidth={3} />
                  </span>
                </div>
                <h3>
                  Большие планы начинаются
                  <br />с маленькой задачи
                </h3>
                <p>
                  Добавьте первое дело в поле выше.
                  <br />
                  Здесь будет чуть больше порядка.
                </p>
                <span className="empty-caption">
                  <ArrowRight size={13} aria-hidden="true" /> Один шаг — уже начало
                </span>
              </div>
            ) : (
              <SortableTaskList
                tasks={tasks}
                onToggle={(id) => store.dispatch({ type: 'toggle', id })}
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

          <div className="card-footer">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>
              {persistence === 'saved'
                ? 'Сохраняется автоматически в этом браузере'
                : 'Изменения хранятся только в памяти вкладки'}
            </span>
            <span className="save-dot" data-saved={persistence === 'saved'} aria-hidden="true" />
          </div>
        </Card>

        {deleted && (
          <div className="undo-panel">
            <div>
              <span className="undo-title">Задача удалена</span>
              <span className="undo-text">{deleted.task.title}</span>
            </div>
            <Button variant="outline" size="sm" onClick={undoDelete}>
              <RotateCcw size={14} aria-hidden="true" /> Отменить
            </Button>
          </div>
        )}

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

        <p className="below-card">Без гонки за продуктивностью. Просто по делу.</p>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          <span key={snapshot.revision}>{snapshot.announcement}</span>
        </div>
      </main>

      <footer className="site-footer">
        <span>Маленький список. Спокойная голова.</span>
        <span>
          Данные остаются у вас <LockKeyhole size={12} aria-hidden="true" />
        </span>
      </footer>
    </div>
  )
}
