import type { Task, Member } from "@/lib/types";
import { PRIORITY_DOTS, ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface TeamProps {
  tasks: Task[];
  members: Member[];
}

export function Team({ tasks, members }: TeamProps) {
  if (members.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">👥</div>
        <h3 className="text-base font-extrabold text-marine">Aucun membre</h3>
        <p className="text-sm text-muted font-semibold mt-1">
          Ajoutez des membres dans les paramètres
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {members.map((m) => {
        const mTasks = tasks.filter((t) => t.assignee === m.id);
        const todo = mTasks.filter((t) => t.status === "todo").length;
        const prog = mTasks.filter((t) => t.status === "progress").length;
        const done = mTasks.filter((t) => t.status === "done").length;
        const activeTasks = mTasks.filter((t) => t.status !== "done").slice(0, 5);

        return (
          <div
            key={m.id}
            className="bg-white border border-border rounded-lg shadow-sm"
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-marine">
                {m.firstname} {m.lastname}
              </h3>
              <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-marine-light text-muted">
                {ROLE_LABELS[m.role]}
              </span>
            </div>
            <div className="p-5">
              <div className="flex gap-2 mb-4">
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-danger-light text-danger">
                  {todo} à faire
                </span>
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-warning-light text-warning">
                  {prog} en cours
                </span>
                <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-success-light text-success">
                  {done} terminé
                </span>
              </div>
              {activeTasks.length === 0 ? (
                <p className="text-sm text-muted font-semibold">
                  Aucune tâche en cours
                </p>
              ) : (
                <div className="space-y-1">
                  {activeTasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 py-1.5 border-b border-border last:border-0"
                    >
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          PRIORITY_DOTS[t.priority]
                        )}
                      />
                      <span className="text-sm font-semibold truncate">
                        {t.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
