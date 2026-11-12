import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, TextAlignStart, ChevronUp } from 'lucide-react'
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

  const descriptionRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (expanded) descriptionRef.current?.focus()
  }, [expanded])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const titleMessage = validateText(title)
    const message = titleMessage ?? validateDescription(description)
    setError(message)
    if (message) {
      if (titleMessage) inputRef.current?.focus()
      else {
        setExpanded(true)
        descriptionRef.current?.focus()
      }
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
      <label className="sr-only" htmlFor="new-task">
        Заголовок задачи
      </label>
      <Collapsible open={expanded} onOpenChange={setExpanded} className="composer-field">
        <div className="composer-input-row">
          <Input
            ref={inputRef}
            id="new-task"
            name="title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setError(null)
            }}
            placeholder="Что нужно сделать?"
            maxLength={MAX_TASK_LENGTH}
            autoComplete="off"
            aria-invalid={!!error && !!validateText(title)}
            aria-describedby={error && validateText(title) ? 'input-error' : 'input-hint'}
            className="task-input"
          />
          <Button
            type="submit"
            className="add-button"
            size="icon"
            aria-label="Добавить задачу"
            title="Добавить задачу"
          >
            <Plus aria-hidden="true" size={20} />
          </Button>
        </div>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="description-toggle">
            {expanded ? <ChevronUp aria-hidden="true" /> : <TextAlignStart aria-hidden="true" />}
            {expanded ? 'Свернуть детали' : 'Добавить детали'}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="description-field">
          <div className="description-field-inner">
            <label htmlFor="new-description" className="form-label">
              Описание <span className="optional-label">необязательно</span>
            </label>
            <Textarea
              ref={descriptionRef}
              id="new-description"
              name="description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                setError(null)
              }}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={3}
              placeholder="Детали, ссылки или следующий шаг…"
              aria-invalid={!!error && !!validateDescription(description)}
              aria-describedby={
                error && validateDescription(description) ? 'input-error' : 'description-hint'
              }
            />
            <p id="description-hint" className="input-hint">
              До {MAX_DESCRIPTION_LENGTH} символов · Enter — новая строка
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {error ? (
        <p id="input-error" className="input-error" role="alert">
          {error}
        </p>
      ) : (
        <p id="input-hint" className="sr-only">
          Enter, чтобы добавить · до {MAX_TASK_LENGTH} символов
        </p>
      )}
    </form>
  )
}
