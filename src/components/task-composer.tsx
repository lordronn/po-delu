import { useRef, useState, type FormEvent } from 'react'
import { CornerDownLeft, Plus, TextAlignStart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  MAX_TASK_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  validateText,
  validateDescription,
} from '@/domain/tasks'

export function TaskComposer({ onAdd }: { onAdd: (title: string, description: string) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = validateText(title) ?? validateDescription(description)
    setError(message)
    if (message) {
      inputRef.current?.focus()
      return
    }
    onAdd(title, description)
    setTitle('')
    setDescription('')
    setExpanded(false)
    inputRef.current?.focus()
  }

  return (
    <form className="add-form" onSubmit={submit} noValidate>
      <label className="form-label" htmlFor="new-task">
        Заголовок задачи
      </label>
      <div className="input-group">
        <Input
          ref={inputRef}
          id="new-task"
          name="title"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            setError(null)
          }}
          placeholder="Например, разобрать почту"
          maxLength={MAX_TASK_LENGTH}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby={error ? 'input-error' : 'input-hint'}
          className="task-input"
        />
        <Button type="submit" className="add-button">
          <Plus aria-hidden="true" size={18} />
          <span>Добавить</span>
        </Button>
      </div>
      {error ? (
        <p id="input-error" className="input-error" role="alert">
          {error}
        </p>
      ) : (
        <p id="input-hint" className="input-hint">
          <CornerDownLeft size={12} aria-hidden="true" /> Enter, чтобы добавить · до{' '}
          {MAX_TASK_LENGTH} символов
        </p>
      )}
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="description-toggle">
            <TextAlignStart aria-hidden="true" />
            {expanded ? 'Скрыть описание' : 'Добавить описание'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="description-field">
          <label htmlFor="new-description" className="form-label">
            Описание <span className="optional-label">необязательно</span>
          </label>
          <Textarea
            id="new-description"
            name="description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              setError(null)
            }}
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={3}
            placeholder="Детали, заметки или следующий шаг"
            aria-describedby="description-hint"
          />
          <p id="description-hint" className="input-hint">
            До {MAX_DESCRIPTION_LENGTH} символов. Переносы строк сохраняются.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </form>
  )
}
