import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import type { Control, Dossier } from "@/lib/types";
import { cn, formatPeriod, getLast12Periods } from "@/lib/utils";

interface ControlsProps {
  controls: Control[];
  dossiers: Dossier[];
  onUpdateCheck: (controlId: string, checkIdx: number, status: "ok" | "ko", detail?: string) => void;
  onNewControl: () => void;
}

export function Controls({
  controls,
  dossiers,
  onUpdateCheck,
  onNewControl,
}: ControlsProps) {
  const [filterPeriod, setFilterPeriod] = useState("");
  const [filterDossier, setFilterDossier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const periods = getLast12Periods();

  let filtered = [...controls];
  if (filterPeriod) filtered = filtered.filter((c) => c.period === filterPeriod);
  if (filterDossier) filtered = filtered.filter((c) => c.dossierId === filterDossier);
  if (filterStatus) filtered = filtered.filter((c) => c.status === filterStatus);

  const selectClass =
    "px-3 py-2 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select className={selectClass} value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
          <option value="">Toutes les périodes</option>
          {periods.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <select className={selectClass} value={filterDossier} onChange={(e) => setFilterDossier(e.target.value)}>
          <option value="">Tous les dossiers</option>
          {dossiers.map((d) => (
            <option key={d.id} value={d.id}>{d.nom} ({d.numero})</option>
          ))}
        </select>
        <select className={selectClass} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="ok">Conforme</option>
          <option value="ko">Anomalie</option>
        </select>
        <div className="ml-auto">
          <button
            onClick={onNewControl}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            <Plus size={14} /> Lancer un contrôle
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🔍</div>
          <h3 className="text-base font-extrabold text-marine">Aucun contrôle</h3>
          <p className="text-sm text-muted font-semibold mt-1">
            Lancez un contrôle mensuel pour vérifier les bulletins
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ctrl) => {
            const doneCount = ctrl.checks.filter((c) => c.status !== "pending").length;
            const progress = ctrl.checks.length
              ? Math.round((doneCount / ctrl.checks.length) * 100)
              : 0;
            const barColor =
              ctrl.status === "ko"
                ? "bg-danger"
                : ctrl.status === "ok"
                ? "bg-success"
                : "bg-warning";

            return (
              <div
                key={ctrl.id}
                className="bg-white border border-border rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-extrabold text-marine">
                    {ctrl.status === "ok" ? "✅" : ctrl.status === "ko" ? "❌" : "⏳"}{" "}
                    {ctrl.dossierName} — {formatPeriod(ctrl.period)}
                  </h4>
                  <span
                    className={cn(
                      "text-[11px] font-extrabold px-2 py-0.5 rounded",
                      ctrl.status === "ok"
                        ? "bg-success-light text-success"
                        : ctrl.status === "ko"
                        ? "bg-danger-light text-danger"
                        : "bg-warning-light text-warning"
                    )}
                  >
                    {ctrl.status === "ok" ? "Conforme" : ctrl.status === "ko" ? "Anomalie(s)" : "En attente"}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-background rounded-full overflow-hidden mb-4">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", barColor)}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                {/* Checks */}
                <div className="space-y-2">
                  {ctrl.checks.map((ch, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 py-2 px-3 bg-background rounded-md"
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0",
                          ch.status === "ok" && "bg-success-light text-success",
                          ch.status === "ko" && "bg-danger-light text-danger",
                          ch.status === "warn" && "bg-warning-light text-warning",
                          ch.status === "pending" && "bg-marine-light text-muted"
                        )}
                      >
                        {ch.status === "ok" ? "✓" : ch.status === "ko" ? "✗" : ch.status === "warn" ? "!" : "…"}
                      </div>
                      <span className="flex-1 text-sm font-semibold">{ch.name}</span>
                      {ch.detail && (
                        <span className="text-xs text-muted">{ch.detail}</span>
                      )}
                      {ch.status === "pending" && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => onUpdateCheck(ctrl.id, idx, "ok")}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs font-bold hover:border-success hover:text-success transition-all"
                          >
                            <Check size={12} /> OK
                          </button>
                          <button
                            onClick={() => {
                              const detail = prompt("Détail de l'anomalie:") || "";
                              onUpdateCheck(ctrl.id, idx, "ko", detail);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-xs font-bold hover:border-danger hover:text-danger transition-all"
                          >
                            <X size={12} /> KO
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
