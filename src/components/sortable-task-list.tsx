import { useRef, useState } from 'react'
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { Accessibility, Feedback } from '@dnd-kit/dom'
import { OptimisticSortingPlugin } from '@dnd-kit/dom/sortable'
import { ArrowUp, ArrowDown, ChevronDown, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Task } from '@/domain/tasks'

type Move = (
  id: string,
  overId: string,
  focus: 'drag' | 'buttons',
  expected?: readonly Task[],
) => void
interface Props {
  tasks: readonly Task[]
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
  onMove,
}: Props & { task: Task; index: number }) {
  const [open, setOpen] = useState(false)
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id: task.id,
    index,
    disabled: tasks.length < 2,
    transition: null,
    // Keep React as the sole owner of list order, including during external updates.
    plugins: (defaults) => defaults.filter((plugin) => plugin !== OptimisticSortingPlugin),
  })
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
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
          <CollapsibleTrigger asChild>
            <button
              id={`details-${task.id}`}
              type="button"
              className="task-trigger"
              aria-label={`Подробности: ${task.title}`}
            >
              <span className="task-label">{task.title}</span>
              <ChevronDown size={16} aria-hidden="true" className="task-chevron" />
            </button>
          </CollapsibleTrigger>
          <div className="task-actions">
            <Button
              variant="ghost"
              size="icon"
              className="edit-button"
              onClick={() => onEdit(task)}
              aria-label={`Изменить: ${task.title}`}
              title="Редактировать задачу"
            >
              <span className="edit-button-icon">
                <Pencil size={16} aria-hidden="true" />
              </span>
            </Button>
            <Button
              ref={handleRef}
              id={`drag-${task.id}`}
              variant="ghost"
              size="icon"
              className="drag-handle"
              disabled={tasks.length < 2}
              aria-label={`Переместить: ${task.title}`}
            >
              <GripVertical size={17} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="delete-button"
              aria-label={`Удалить: ${task.title}`}
              onClick={() => onDelete(task, index)}
            >
              <Trash2 aria-hidden="true" size={17} />
            </Button>
          </div>
        </div>
        <CollapsibleContent className="task-details">
          <p className={task.description ? 'task-description' : 'task-description no-description'}>
            {task.description || 'Описание пока не добавлено.'}
          </p>
          <div className="detail-actions">
            <span className="move-controls">
              <Button
                variant="ghost"
                size="icon"
                disabled={index === 0}
                aria-label={`Выше: ${task.title}`}
                onClick={() => {
                  const previous = tasks[index - 1]
                  if (previous) onMove(task.id, previous.id, 'buttons')
                }}
              >
                <ArrowUp size={15} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={index === tasks.length - 1}
                aria-label={`Ниже: ${task.title}`}
                onClick={() => {
                  const next = tasks[index + 1]
                  if (next) onMove(task.id, next.id, 'buttons')
                }}
              >
                <ArrowDown size={15} aria-hidden="true" />
              </Button>
            </span>
          </div>
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
              'Для переноса нажмите пробел или Enter, затем используйте стрелки. Для завершения нажмите пробел или Enter, для отмены — Escape. Также можно раскрыть задачу и использовать кнопки «Выше» и «Ниже».',
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
        if (event.canceled || !source || !target || source.id === target.id || !expected) return
        props.onMove(String(source.id), String(target.id), 'drag', expected)
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
