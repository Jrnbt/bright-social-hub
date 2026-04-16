import { useMemo } from "react";
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  Building2,
  Search,
  Mail,
} from "lucide-react";
import type { Task, Member, Dossier, Control } from "@/lib/types";
import {
  PRIORITY_LABELS,
  PRIORITY_DOTS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/lib/constants";
import { cn, formatPeriod } from "@/lib/utils";

interface DashboardProps {
  tasks: Task[];
  members: Member[];
  dossiers: Dossier[];
  controls: Control[];
  onNavigate: (page: string) => void;
}

function KpiCard({
  icon,
  value,
  label,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-white border border-border rounded-lg p-5 shadow-sm transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:border-rose/30 hover:-translate-y-0.5"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "w-10 h-10 rounded-[10px] flex items-center justify-center mb-3",
          color
        )}
      >
        {icon}
      </div>
      <div className="text-3xl font-black text-marine leading-none">
        {value}
      </div>
      <div className="text-xs font-bold text-muted mt-1">{label}</div>
    </div>
  );
}

export function Dashboard({
  tasks,
  members,
  dossiers,
  controls,
  onNavigate,
}: DashboardProps) {
  const stats = useMemo(() => {
    const now = new Date();
    let todo = 0, progress = 0, doneThisMonth = 0, missive = 0;
    for (const t of tasks) {
      if (t.status === "todo") todo++;
      else if (t.status === "progress") progress++;
      else if (t.status === "done") {
        const d = new Date(t.createdAt);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) doneThisMonth++;
      }
      if (t.source === "missive") missive++;
    }
    return { todo, progress, doneThisMonth, missive };
  }, [tasks]);

  const tasksByAssignee = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.assignee) {
        const arr = map.get(t.assignee) ?? [];
        arr.push(t);
        map.set(t.assignee, arr);
      }
    }
    return map;
  }, [tasks]);

  const pendingControls = controls.filter((c) => c.status === "pending").length;

  const urgentTasks = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        (t.priority === "urgent" || t.priority === "high")
    )
    .slice(0, 5);

  const recentControls = controls.slice(0, 5);

  return (
    <div>
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <KpiCard
          icon={<ClipboardList size={20} className="text-rose" />}
          value={stats.todo}
          label="Tâches à faire"
          color="bg-rose-light"
          onClick={() => onNavigate("tasks")}
        />
        <KpiCard
          icon={<Clock size={20} className="text-warning" />}
          value={stats.progress}
          label="Tâches en cours"
          color="bg-warning-light"
          onClick={() => onNavigate("tasks")}
        />
        <KpiCard
          icon={<CheckCircle2 size={20} className="text-success" />}
          value={stats.doneThisMonth}
          label="Terminées ce mois"
          color="bg-success-light"
          onClick={() => onNavigate("tasks")}
        />
        <KpiCard
          icon={<Building2 size={20} className="text-info" />}
          value={dossiers.length}
          label="Dossiers suivis"
          color="bg-info-light"
          onClick={() => onNavigate("dossiers")}
        />
        <KpiCard
          icon={<Search size={20} className="text-danger" />}
          value={pendingControls}
          label="Contrôles en attente"
          color="bg-danger-light"
          onClick={() => onNavigate("controls")}
        />
        <KpiCard
          icon={<Mail size={20} className="text-success" />}
          value={stats.missive}
          label="Emails Missive"
          color="bg-success-light"
          onClick={() => onNavigate("tasks")}
        />
      </div>

      {/* Two column cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Urgent tasks */}
        <div className="bg-white border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-marine">
              Tâches urgentes
            </h3>
            <button
              onClick={() => onNavigate("tasks")}
              className="text-xs font-extrabold text-muted hover:text-rose transition-colors"
            >
              Voir tout &rarr;
            </button>
          </div>
          <div className="p-5">
            {urgentTasks.length === 0 ? (
              <p className="text-center text-sm text-muted py-4">
                Aucune tâche urgente
              </p>
            ) : (
              <div className="space-y-2">
                {urgentTasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        PRIORITY_DOTS[t.priority]
                      )}
                    />
                    <span className="text-sm font-bold flex-1 truncate">
                      {t.title}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-extrabold px-2 py-0.5 rounded",
                        STATUS_COLORS[t.status]
                      )}
                    >
                      {STATUS_LABELS[t.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent controls */}
        <div className="bg-white border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-marine">
              Derniers contrôles
            </h3>
            <button
              onClick={() => onNavigate("controls")}
              className="text-xs font-extrabold text-muted hover:text-rose transition-colors"
            >
              Voir tout &rarr;
            </button>
          </div>
          <div className="p-5">
            {recentControls.length === 0 ? (
              <p className="text-center text-sm text-muted py-4">
                Aucun contrôle récent
              </p>
            ) : (
              <div className="space-y-2">
                {recentControls.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                  >
                    <span>
                      {c.status === "ok"
                        ? "✅"
                        : c.status === "ko"
                        ? "❌"
                        : "⏳"}
                    </span>
                    <span className="text-sm font-bold flex-1 truncate">
                      {c.dossierName}
                    </span>
                    <span className="text-xs text-muted font-semibold">
                      {formatPeriod(c.period)}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-extrabold px-2 py-0.5 rounded",
                        c.status === "ok"
                          ? "bg-success-light text-success"
                          : c.status === "ko"
                          ? "bg-danger-light text-danger"
                          : "bg-warning-light text-warning"
                      )}
                    >
                      {c.status === "ok"
                        ? "Conforme"
                        : c.status === "ko"
                        ? "Anomalie"
                        : "En attente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Team activity */}
      <div className="bg-white border border-border rounded-lg shadow-sm mt-5">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-extrabold text-marine">
            Activité de l'équipe cette semaine
          </h3>
        </div>
        <div className="p-5">
          {members.length === 0 ? (
            <p className="text-center text-sm text-muted py-4">
              Ajoutez des membres dans les paramètres
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((m) => {
                const mTasks = tasksByAssignee.get(m.id) ?? [];
                const done = mTasks.filter((t) => t.status === "done").length;
                const total = mTasks.length;
                const pct = total ? Math.round((done / total) * 100) : 0;

                return (
                  <div key={m.id} className="flex items-center gap-4">
                    <span className="text-sm font-extrabold w-36 truncate">
                      {m.firstname} {m.lastname}
                    </span>
                    <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-muted w-20 text-right">
                      {done}/{total} tâches
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
