import { useState } from "react";
import { Plus, RefreshCw, Pencil, Trash2, Mail } from "lucide-react";
import type { Task, Member, Dossier } from "@/lib/types";
import {
  PRIORITY_LABELS,
  PRIORITY_DOTS,
  STATUS_LABELS,
  STATUS_COLORS,
  CATEGORY_LABELS,
} from "@/lib/constants";
import { cn, formatShortDate, isOverdue } from "@/lib/utils";

interface TasksProps {
  tasks: Task[];
  members: Member[];
  dossiers: Dossier[];
  onToggleStatus: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onNewTask: () => void;
  onSyncMissive: () => void;
}

export function Tasks({
  tasks,
  members,
  dossiers,
  onToggleStatus,
  onEdit,
  onDelete,
  onNewTask,
  onSyncMissive,
}: TasksProps) {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");

  let filtered = [...tasks];
  if (filterStatus) filtered = filtered.filter((t) => t.status === filterStatus);
  if (filterPriority) filtered = filtered.filter((t) => t.priority === filterPriority);
  if (filterCategory) filtered = filtered.filter((t) => t.category === filterCategory);
  if (filterSource) filtered = filtered.filter((t) => t.source === filterSource);
  if (filterAssignee) filtered = filtered.filter((t) => t.assignee === filterAssignee);

  const prioOrder: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  filtered.sort((a, b) => (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2));

  const selectClass =
    "px-3 py-2 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select className={selectClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="todo">À faire</option>
          <option value="progress">En cours</option>
          <option value="done">Terminé</option>
        </select>
        <select className={selectClass} value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">Toutes priorités</option>
          <option value="urgent">Urgent</option>
          <option value="high">Haute</option>
          <option value="normal">Normale</option>
          <option value="low">Basse</option>
        </select>
        <select className={selectClass} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          <option value="paie">Paie</option>
          <option value="rh">RH</option>
          <option value="admin">Admin</option>
          <option value="client">Client</option>
          <option value="autre">Autre</option>
        </select>
        <select className={selectClass} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">Toutes sources</option>
          <option value="manual">Manuelle</option>
          <option value="missive">Missive</option>
        </select>
        <select className={selectClass} value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
          <option value="">Tous membres</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstname} {m.lastname}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button
            onClick={onNewTask}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            <Plus size={14} /> Nouvelle tâche
          </button>
          <button
            onClick={onSyncMissive}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all"
          >
            <RefreshCw size={14} /> Missive
          </button>
        </div>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardEmpty />
          <h3 className="text-base font-extrabold text-marine mt-4">
            Aucune tâche
          </h3>
          <p className="text-sm text-muted font-semibold mt-1">
            Créez une tâche ou synchronisez avec Missive
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const member = members.find((m) => m.id === task.assignee);
            const dossier = dossiers.find((d) => d.id === task.dossier);
            const overdue = task.status !== "done" && isOverdue(task.due);

            return (
              <div
                key={task.id}
                className="flex items-start gap-3 p-4 bg-white border border-border rounded-lg hover:shadow-md hover:border-rose/30 transition-all"
              >
                {/* Checkbox */}
                <button
                  onClick={() => onToggleStatus(task.id)}
                  className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all",
                    task.status === "done"
                      ? "bg-success border-success text-white"
                      : "border-border hover:border-rose"
                  )}
                >
                  {task.status === "done" && (
                    <span className="text-xs">✓</span>
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div
                    className={cn(
                      "text-sm font-bold",
                      task.status === "done" && "line-through opacity-50"
                    )}
                  >
                    {task.title}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span
                      className={cn(
                        "text-[11px] font-extrabold px-2 py-0.5 rounded",
                        STATUS_COLORS[task.status]
                      )}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-marine-light text-muted">
                      {CATEGORY_LABELS[task.category]}
                    </span>
                    {task.source === "missive" && (
                      <span className="text-[11px] font-bold flex items-center gap-1 text-info">
                        <Mail size={10} /> Missive
                      </span>
                    )}
                    {member && (
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-info-light text-info">
                        {member.firstname}
                      </span>
                    )}
                    {dossier && (
                      <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-marine-light text-muted">
                        {dossier.nom}
                      </span>
                    )}
                    {task.due && (
                      <span
                        className={cn(
                          "text-[11px] font-extrabold px-2 py-0.5 rounded",
                          overdue
                            ? "bg-danger-light text-danger"
                            : "bg-marine-light text-muted"
                        )}
                      >
                        {overdue && "⚠ "}
                        {formatShortDate(task.due)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority dot */}
                <span
                  className={cn(
                    "w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5",
                    PRIORITY_DOTS[task.priority]
                  )}
                  title={PRIORITY_LABELS[task.priority]}
                />

                {/* Actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => onEdit(task.id)}
                    className="p-1.5 rounded hover:bg-background transition-colors text-muted hover:text-marine"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(task.id)}
                    className="p-1.5 rounded hover:bg-danger-light transition-colors text-muted hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClipboardEmpty() {
  return (
    <div className="text-5xl">📋</div>
  );
}
