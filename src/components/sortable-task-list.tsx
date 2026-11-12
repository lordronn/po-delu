import { useEffect, useRef, useState } from 'react'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { Accessibility, Feedback } from '@dnd-kit/dom'
import { OptimisticSortingPlugin } from '@dnd-kit/dom/sortable'
import { ChevronDown, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Task } from '@/domain/tasks'

type Move = (id: string, overId: string, expected?: readonly Task[]) => void
interface Props {
  tasks: readonly Task[]
  ordering: boolean
  onToggle: (id: string) => void
  onDelete: (task: Task, index: number) => void
  onEdit: (task: Task) => void
  onMove: Move
}

function TaskRow({
  task,
  index,
  tasks,
  onToggle,
  onDelete,
  onEdit,
  ordering,
}: Props & { task: Task; index: number }) {
  const [open, setOpen] = useState(false)
  const hasDescription = !!task.description
  const expanded = open && hasDescription
  useEffect(() => {
    if (!hasDescription) setOpen(false)
  }, [hasDescription])
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id: task.id,
    index,
    disabled: !ordering || tasks.length < 2,
    transition: null,
    // Keep React as the sole owner of list order, including during external updates.
    plugins: (defaults) => defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
  })
  return (
    <Collapsible open={expanded} onOpenChange={setOpen} asChild>
      <li
        ref={ref}
        className="task-item"
        data-task-id={task.id}
        data-dragging={isDragSource}
        data-over={isDropTarget}
        data-done={task.done}
      >
        <div className="task-row">
          <Checkbox
            id={`task-${task.id}`}
            checked={task.done}
            onCheckedChange={() => onToggle(task.id)}
            className="task-checkbox"
            aria-label={`${task.done ? 'Вернуть в работу' : 'Выполнить'}: ${task.title}`}
          />
          {task.description ? (
            <CollapsibleTrigger asChild>
              <button
                id={`details-${task.id}`}
                type="button"
                className="task-trigger"
                title={task.title}
              >
                <span className="sr-only">Подробности: </span>
                <span className="task-label">{task.title}</span>
                <ChevronDown size={15} aria-hidden="true" className="task-chevron" />
              </button>
            </CollapsibleTrigger>
          ) : (
            <span className="task-trigger task-title-static" title={task.title}>
              <span className="task-label">{task.title}</span>
            </span>
          )}
          <div className="task-actions">
            {/* Keep a stable sensor target so dnd-kit never annotates the entire row as a button. */}
            <Button
              ref={handleRef}
              id={`drag-${task.id}`}
              variant="ghost"
              size="icon"
              className="drag-handle"
              hidden={!ordering || tasks.length < 2}
              disabled={!ordering || tasks.length < 2}
              aria-label={`Переместить: ${task.title}`}
            >
              <GripVertical size={17} aria-hidden="true" />
            </Button>
            {(!ordering || tasks.length < 2) && (
              <Button
                id={`edit-${task.id}`}
                variant="ghost"
                size="icon"
                className="edit-button"
                onClick={() => onEdit(task)}
                aria-label={`Изменить: ${task.title}`}
                title="Редактировать задачу"
              >
                <Pencil size={16} aria-hidden="true" />
              </Button>
            )}
            <Button
              id={`delete-${task.id}`}
              variant="ghost"
              size="icon"
              className="delete-button"
              aria-label={`Удалить: ${task.title}`}
              onClick={() => onDelete(task, index)}
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
        <CollapsibleContent className="task-details">
          <p className="task-description">{task.description}</p>
        </CollapsibleContent>
      </li>
    </Collapsible>
  )
}

export function SortableTaskList(props: Props) {
  const start = useRef<readonly Task[] | null>(null)
  return (
    <DragDropProvider
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== Accessibility && plugin !== Feedback),
        Feedback.configure({ dropAnimation: null }),
        Accessibility.configure({
          screenReaderInstructions: {
            draggable:
              'Для переноса нажмите пробел или Enter, затем используйте стрелки. Для завершения нажмите пробел или Enter, для отмены — Escape.',
          },
          announcements: {
            dragstart: () => 'Перенос начат. Используйте стрелки для выбора позиции.',
            dragend: (event: DragEndEvent) =>
              event.canceled ? 'Перенос отменён.' : 'Перенос завершён.',
          },
        }),
      ]}
      onDragStart={() => {
        start.current = props.tasks
      }}
      onDragEnd={(event) => {
        const { source, target } = event.operation
        const expected = start.current
        start.current = null
        if (!expected) return
        if (expected !== props.tasks) {
          props.onMove(String(source?.id ?? ''), String(target?.id ?? ''), expected)
          return
        }
        if (event.canceled || !source || !target || source.id === target.id) return
        props.onMove(String(source.id), String(target.id), expected)
      }}
    >
      <ul className="task-list" aria-label="Задачи">
        {props.tasks.map((task, index) => (
          <TaskRow key={task.id} {...props} task={task} index={index} />
        ))}
      </ul>
    </DragDropProvider>
  )
}
