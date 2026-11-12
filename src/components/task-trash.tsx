import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { Task } from '@/domain/tasks'

interface Props {
  tasks: readonly Task[]
  onRestore: (id: string) => void
  onPurge: (task: Task) => void
}

export function TaskTrash({ tasks, onRestore, onPurge }: Props) {
  return (
    <Collapsible className="trash-section">
      <CollapsibleTrigger asChild>
        <button id="trash-toggle" type="button" className="trash-toggle">
          <Trash2 size={16} aria-hidden="true" />
          Корзина <span className="trash-count">{tasks.length}</span>
          <ChevronDown size={16} aria-hidden="true" className="task-chevron" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {tasks.length === 0 ? (
          <p className="trash-empty">Корзина пуста.</p>
        ) : (
          <>
            <p className="trash-hint">Задачи хранятся здесь, пока вы не удалите их окончательно.</p>
            <ul className="trash-list" aria-label="Удалённые задачи">
              {tasks.map((task) => (
                <li key={task.id} data-trash-id={task.id} className="trash-item">
                  {task.description ? (
                    <details className="trash-details">
                      <summary>
                        <span className="task-label" title={task.title}>
                          {task.title}
                        </span>
                        <ChevronDown size={15} aria-hidden="true" />
                      </summary>
                      <p className="task-description">{task.description}</p>
                    </details>
                  ) : (
                    <p className="task-label trash-title" title={task.title}>
                      {task.title}
                    </p>
                  )}
                  {task.done && <span className="trash-status">Была выполнена</span>}
                  <div className="trash-actions">
                    <Button
                      id={`restore-${task.id}`}
                      variant="outline"
                      size="sm"
                      onClick={() => onRestore(task.id)}
                      aria-label={`Восстановить: ${task.title}`}
                    >
                      <RotateCcw size={14} aria-hidden="true" /> Восстановить
                    </Button>
                    <Button
                      id={`purge-${task.id}`}
                      variant="ghost"
                      size="sm"
                      className="purge-button"
                      onClick={() => onPurge(task)}
                      aria-label={`Удалить навсегда: ${task.title}`}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Удалить навсегда
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
