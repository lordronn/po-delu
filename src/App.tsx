import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import {
  ArrowRight,
  Check,
  CheckCheck,
  CornerDownLeft,
  ListTodo,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { MAX_TASK_LENGTH, validateText, type Task } from '@/domain/tasks'
import { STORAGE_KEY, type StorageBackend } from '@/data/storage'
import type { TaskStore } from '@/app/task-store'

interface AppProps {
  store: TaskStore
  backend: StorageBackend | null
}

const storageMessages = {
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

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: Task
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <li className="task-row" data-done={task.done} data-task-id={task.id}>
      <Checkbox
        id={`task-${task.id}`}
        checked={task.done}
        onCheckedChange={onToggle}
        className="task-checkbox"
        aria-label={`${task.done ? 'Вернуть в работу' : 'Выполнить'}: ${task.text}`}
      />
      <label className="task-label" htmlFor={`task-${task.id}`}>
        {task.text}
      </label>
      <Button
        variant="ghost"
        size="icon"
        className="delete-button"
        aria-label={`Удалить: ${task.text}`}
        onClick={onDelete}
      >
        <Trash2 aria-hidden="true" size={17} />
      </Button>
    </li>
  )
}

export default function App({ store, backend }: AppProps) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { tasks, deleted, persistence } = snapshot
  const [text, setText] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
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
    const element = document.getElementById(target) ?? inputRef.current
    element?.focus()
  }, [snapshot])

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = validateText(text)
    setInputError(error)
    if (error) {
      inputRef.current?.focus()
      return
    }
    store.dispatch({ type: 'add', id: crypto.randomUUID(), text })
    setText('')
    inputRef.current?.focus()
  }

  function removeTask(task: Task, index: number) {
    const neighbor = tasks[index + 1] ?? tasks[index - 1]
    pendingFocus.current = neighbor ? `task-${neighbor.id}` : 'new-task'
    store.dispatch({ type: 'delete', id: task.id })
  }

  function undoDelete() {
    pendingFocus.current = deleted ? `task-${deleted.task.id}` : 'new-task'
    store.dispatch({ type: 'undo' })
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
      persistence === 'conflict' &&
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
        <a className="brand" href="#" aria-label="По делу — на главную">
          <span className="brand-mark">
            <Check aria-hidden="true" size={22} strokeWidth={2.6} />
          </span>
          <span>
            по делу<span className="brand-dot">.</span>
          </span>
        </a>
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
          <form className="add-form" onSubmit={addTask} noValidate>
            <label className="form-label" htmlFor="new-task">
              Что нужно сделать?
            </label>
            <div className="input-group">
              <Input
                ref={inputRef}
                id="new-task"
                name="task"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  if (inputError) setInputError(null)
                }}
                placeholder="Например, разобрать почту"
                maxLength={MAX_TASK_LENGTH}
                autoComplete="off"
                aria-invalid={!!inputError}
                aria-describedby={inputError ? 'input-error' : 'input-hint'}
                className="task-input"
              />
              <Button type="submit" className="add-button">
                <Plus aria-hidden="true" size={18} />
                <span>Добавить</span>
              </Button>
            </div>
            {inputError ? (
              <p id="input-error" className="input-error" role="alert">
                {inputError}
              </p>
            ) : (
              <p id="input-hint" className="input-hint">
                <CornerDownLeft size={12} aria-hidden="true" /> Enter, чтобы добавить · до{' '}
                {MAX_TASK_LENGTH} символов
              </p>
            )}
          </form>

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
              <ul className="task-list" aria-label="Задачи">
                {tasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onToggle={() => store.dispatch({ type: 'toggle', id: task.id })}
                    onDelete={() => removeTask(task, index)}
                  />
                ))}
              </ul>
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
              <span className="undo-text">{deleted.task.text}</span>
            </div>
            <Button variant="outline" size="sm" onClick={undoDelete}>
              <RotateCcw size={14} aria-hidden="true" /> Отменить
            </Button>
          </div>
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
