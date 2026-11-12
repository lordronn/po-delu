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
  activeId,
}: Props & { task: Task; index: number; activeId: string | null }) {
  const [open, setOpen] = useState(false)
  const hasDescription = !!task.description
  const expanded = open && hasDescription
  useEffect(() => {
    if (!hasDescription) setOpen(false)
  }, [hasDescription])
  const { ref, handleRef, isDragSource, isDropTarget } = useSortable({
    id: task.id,
    index,
    disabled: tasks.length < 2,
    transition: activeId === task.id ? null : { duration: 200 },
    // React owns the live preview as well as the committed order.
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
        <div className="task-row" data-sortable={tasks.length > 1}>
          {/* Keep a stable sensor target so dnd-kit never annotates the entire row as a button. */}
          <Button
            ref={handleRef}
            id={`drag-${task.id}`}
            variant="ghost"
            size="icon"
            className="drag-handle"
            hidden={tasks.length < 2}
            disabled={tasks.length < 2}
            aria-label={`Переместить: ${task.title}`}
          >
            <GripVertical size={17} aria-hidden="true" />
          </Button>

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
  const drag = useRef<{
    base: readonly Task[]
    tasks: readonly Task[]
    revision: number
    activeId: string
  } | null>(null)
  const [preview, setPreview] = useState<{
    base: readonly Task[]
    tasks: readonly Task[]
    activeId: string
  } | null>(null)
  const visibleTasks = preview?.base === props.tasks ? preview.tasks : props.tasks
  return (
    <DragDropProvider
      plugins={(defaults) => [
        ...defaults.filter((plugin) => plugin !== Accessibility && plugin !== Feedback),
        Feedback.configure({ dropAnimation: null, keyboardTransition: null }),
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
      onDragStart={(event) => {
        const activeId = String(event.operation.source?.id ?? '')
        drag.current = { base: props.tasks, tasks: props.tasks, revision: 0, activeId }
        setPreview({ base: props.tasks, tasks: props.tasks, activeId })
      }}
      onDragOver={(event, manager) => {
        const { source, target } = event.operation
        const session = drag.current
        if (!source || !target || !session || session.base !== props.tasks) return
        const { base, tasks: current } = session
        const from = current.findIndex((task) => task.id === source.id)
        const to = current.findIndex((task) => task.id === target.id)
        if (from < 0 || to < 0 || from === to) return
        const next = [...current]
        const [task] = next.splice(from, 1)
        if (!task) return
        next.splice(to, 0, task)
        session.tasks = next
        const revision = ++session.revision
        // Measure collisions against the new layout, not a half-committed render.
        manager.collisionObserver.disable()
        setPreview({ base, tasks: next, activeId: session.activeId })
        void manager.renderer.rendering
          .then(() => {
            if (drag.current !== session || session.tasks !== next) return
            return manager.actions.setDropTarget(source.id)
          })
          .finally(() => {
            if (drag.current === session && session.revision === revision)
              manager.collisionObserver.enable()
          })
      }}
      onDragEnd={(event, manager) => {
        const { source, target } = event.operation
        const expected = drag.current?.base
        const finalOrder = drag.current?.tasks
        drag.current = null
        manager.collisionObserver.enable()
        setPreview(null)
        if (!expected) return
        if (expected !== props.tasks) {
          props.onMove(String(source?.id ?? ''), String(target?.id ?? ''), expected)
          return
        }
        // The preview defines the destination even if collision detection is between frames.
        if (event.canceled || !source || !finalOrder) return
        const destination = finalOrder.findIndex((task) => task.id === source.id)
        const over = expected[destination]
        if (!over || over.id === source.id) return
        props.onMove(String(source.id), over.id, expected)
      }}
    >
      <ul className="task-list" aria-label="Задачи">
        {visibleTasks.map((task, index) => (
          <TaskRow
            key={task.id}
            {...props}
            tasks={visibleTasks}
            task={task}
            index={index}
            activeId={preview?.base === props.tasks ? preview.activeId : null}
            onDelete={(deleted) =>
              props.onDelete(
                deleted,
                props.tasks.findIndex((entry) => entry.id === deleted.id),
              )
            }
          />
        ))}
      </ul>
    </DragDropProvider>
  )
}
