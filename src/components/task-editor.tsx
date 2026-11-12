import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  MAX_TASK_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  validateText,
  validateDescription,
  type Task,
} from '@/domain/tasks'

interface Props {
  initial: Task
  current: Task | undefined
  onSave: (base: Task, title: string, description: string, asNew: boolean) => boolean
  onClose: () => void
}

export function TaskEditor({ initial, current, onSave, onClose }: Props) {
  const [base, setBase] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [error, setError] = useState<string | null>(null)
  const conflict =
    !current || current.title !== base.title || current.description !== base.description

  function save(asNew = false) {
    const titleMessage = validateText(title)
    const message = titleMessage ?? validateDescription(description)
    setError(message)
    if (message) {
      document.getElementById(titleMessage ? 'edit-title' : 'edit-description')?.focus()
      return
    }
    if (conflict && !asNew) {
      setError(
        current
          ? 'Выберите «Загрузить актуальную» или «Добавить как новую».'
          : 'Задача удалена. Чтобы сохранить черновик, выберите «Добавить как новую».',
      )
      return
    }
    if (!onSave(base, title, description, asNew))
      setError('Задача изменилась. Проверьте актуальную версию перед сохранением.')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    save()
  }

  function loadCurrent() {
    if (!current) return
    setBase(current)
    setTitle(current.title)
    setDescription(current.description)
    setError(null)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="task-editor"
        onInteractOutside={(event) => {
          if (title !== base.title || description !== base.description) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          ;(
            document.getElementById(`edit-${initial.id}`) ??
            document.getElementById(`delete-${initial.id}`) ??
            document.getElementById('new-task')
          )?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Изменить задачу</DialogTitle>
          <DialogDescription>Заголовок обязателен. Описание — по желанию.</DialogDescription>
        </DialogHeader>
        {conflict && (
          <Alert className="editor-conflict">
            <AlertTitle>
              {current ? 'Задача изменилась в другой вкладке' : 'Задача удалена в другой вкладке'}
            </AlertTitle>
            <AlertDescription>
              Ваш текст оставлен в редакторе. Можно добавить его отдельной задачей
              {current ? ' или загрузить актуальную версию.' : '.'}
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} noValidate>
          <label htmlFor="edit-title" className="form-label">
            Заголовок задачи
          </label>
          <Input
            id="edit-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setError(null)
            }}
            maxLength={MAX_TASK_LENGTH}
            aria-invalid={!!error && !!validateText(title)}
            aria-describedby={error ? 'edit-error' : 'edit-hint'}
            autoComplete="off"
          />
          <label htmlFor="edit-description" className="form-label editor-description-label">
            Описание
          </label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              setError(null)
            }}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={5}
            aria-invalid={!!error && !!validateDescription(description)}
            aria-describedby={
              error && validateDescription(description) ? 'edit-error' : 'edit-hint'
            }
          />
          <p id="edit-hint" className="input-hint">
            Заголовок — до {MAX_TASK_LENGTH}, описание — до {MAX_DESCRIPTION_LENGTH} символов.
          </p>
          {error && (
            <p id="edit-error" className="input-error" role="alert">
              {error}
            </p>
          )}
          <div className="editor-actions">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            {conflict ? (
              <>
                {current && (
                  <Button type="button" variant="outline" onClick={loadCurrent}>
                    Загрузить актуальную
                  </Button>
                )}
                <Button type="button" onClick={() => save(true)}>
                  Добавить как новую
                </Button>
              </>
            ) : (
              <Button type="submit">Сохранить</Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
