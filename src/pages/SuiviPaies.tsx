import { useState, useRef } from "react";
import { RefreshCw, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import type { SuiviPaieMois, SuiviPaieLine } from "@/lib/types";
import { SUIVI_PAIE_COLUMNS } from "@/lib/constants";
import { cn, formatPeriod, getLast12Periods } from "@/lib/utils";

interface SuiviPaiesProps {
  mois: SuiviPaieMois[];
  onSyncSilae: (period: string) => Promise<void>;
  isSyncing: boolean;
  onUpdateLine: (moisId: string, lineId: string, field: string, value: any) => void;
}

export function SuiviPaies({ mois, onSyncSilae, isSyncing, onUpdateLine }: SuiviPaiesProps) {
  const periods = getLast12Periods();
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.value || "");
  const [editingCell, setEditingCell] = useState<{ lineId: string; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const currentMois = mois.find((m) => m.period === selectedPeriod);
  const lines = currentMois?.lines || [];

  // Stats
  const totalBulletins = lines.reduce((s, l) => s + (l.nombreBulletins || 0), 0);
  const totalEntrees = lines.reduce((s, l) => s + (l.entrees || 0), 0);
  const totalSorties = lines.reduce((s, l) => s + (l.sorties || 0), 0);
  const dsnOk = lines.filter((l) => l.dsn?.toUpperCase() === "OK").length;

  // Navigation
  const currentIdx = periods.findIndex((p) => p.value === selectedPeriod);
  const goNext = () => { if (currentIdx > 0) setSelectedPeriod(periods[currentIdx - 1].value); };
  const goPrev = () => { if (currentIdx < periods.length - 1) setSelectedPeriod(periods[currentIdx + 1].value); };

  // Editing
  const startEditing = (lineId: string, col: string, value: string) => {
    setEditingCell({ lineId, col });
    setEditValue(value ?? "");
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const saveEditing = () => {
    if (editingCell && currentMois) {
      onUpdateLine(currentMois.id, editingCell.lineId, editingCell.col, editValue);
    }
    setEditingCell(null);
  };

  // Last sync display
  const lastSync = currentMois?.lastSyncAt
    ? new Date(currentMois.lastSyncAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>
      {/* Top bar: period nav + stats + sync */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-white border border-border rounded-lg px-2 py-1">
          <button onClick={goPrev} disabled={currentIdx >= periods.length - 1} className="p-1 rounded hover:bg-background transition-colors">
            <ChevronLeft size={16} className={currentIdx >= periods.length - 1 ? "text-border" : "text-marine"} />
          </button>
          <select
            className="text-sm font-extrabold text-marine bg-transparent border-none focus:outline-none px-2 py-1 min-w-[160px] text-center cursor-pointer"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button onClick={goNext} disabled={currentIdx <= 0} className="p-1 rounded hover:bg-background transition-colors">
            <ChevronRight size={16} className={currentIdx <= 0 ? "text-border" : "text-marine"} />
          </button>
        </div>

        {/* Stat chips */}
        {lines.length > 0 && (
          <div className="flex gap-2">
            <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-marine-light text-marine">{lines.length} dossiers</span>
            <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-rose-light text-rose">{totalBulletins} bulletins</span>
            <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-success-light text-success">{totalEntrees} entrées</span>
            <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-danger-light text-danger">{totalSorties} sorties</span>
            <span className="text-[11px] font-extrabold px-3 py-1.5 rounded-lg bg-info-light text-info">DSN {dsnOk}/{lines.length}</span>
          </div>
        )}

        {/* Sync info + button */}
        <div className="ml-auto flex items-center gap-3">
          {lastSync && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Clock size={12} /> Dernière sync: {lastSync}
            </span>
          )}
          <button
            onClick={() => onSyncSilae(selectedPeriod)}
            disabled={isSyncing}
            className={cn(
              "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-extrabold transition-all",
              isSyncing
                ? "bg-marine/10 text-muted cursor-wait"
                : "bg-rose text-white hover:bg-rose-hover"
            )}
          >
            {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {isSyncing ? "Synchronisation..." : "Sync Silae"}
          </button>
        </div>
      </div>

      {/* Sync info banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 mb-4 bg-info-light rounded-lg">
        <Clock size={14} className="text-info flex-shrink-0" />
        <span className="text-xs font-semibold text-info">
          Les données Silae (bulletins, entrées, sorties, DSN) sont synchronisées automatiquement toutes les heures.
          Les colonnes "Date de réception" et "Date d'envoi BS" sont à remplir manuellement.
        </span>
      </div>

      {/* Table */}
      {lines.length === 0 && !isSyncing ? (
        <div className="text-center py-16 bg-white border border-border rounded-lg">
          <div className="text-5xl mb-4">📑</div>
          <h3 className="text-base font-extrabold text-marine">
            Aucune donnée pour {formatPeriod(selectedPeriod)}
          </h3>
          <p className="text-sm text-muted font-semibold mt-1 mb-4">
            Cliquez sur "Sync Silae" pour récupérer les bulletins depuis Silae
          </p>
          <button
            onClick={() => onSyncSilae(selectedPeriod)}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            <RefreshCw size={14} /> Synchroniser depuis Silae
          </button>
        </div>
      ) : (
        <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-background">
                <th className="text-center text-[10px] font-extrabold uppercase tracking-wide text-muted px-3 py-3 border-b border-border w-10">
                  #
                </th>
                {SUIVI_PAIE_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="text-left text-[10px] font-extrabold uppercase tracking-wide text-muted px-3 py-3 border-b border-border whitespace-nowrap"
                    style={{ minWidth: col.width }}
                  >
                    {col.label}
                    {col.editable && (
                      <span className="ml-1 text-rose/50 normal-case tracking-normal font-bold">*</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className="group hover:bg-rose/[0.02] transition-colors">
                  <td className="text-center text-xs font-bold text-muted px-3 py-3 border-b border-border">
                    {idx + 1}
                  </td>
                  {SUIVI_PAIE_COLUMNS.map((col) => {
                    const value = (line as any)[col.key];
                    const isEditing = editingCell?.lineId === line.id && editingCell?.col === col.key;
                    const isBoolean = "type" in col && col.type === "boolean";
                    const isSelect = "type" in col && col.type === "select";
                    const isEditable = col.editable;

                    // Boolean checkbox
                    if (isBoolean) {
                      return (
                        <td key={col.key} className="px-3 py-3 border-b border-border text-center">
                          <span className={cn(
                            "inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold",
                            value ? "bg-success-light text-success" : "bg-background text-muted"
                          )}>
                            {value ? "✓" : "—"}
                          </span>
                        </td>
                      );
                    }

                    // GP select dropdown
                    if (isSelect && col.key === "gp") {
                      return (
                        <td key={col.key} className="px-2 py-1 border-b border-border">
                          <select
                            value={value || ""}
                            onChange={(e) => {
                              if (currentMois) onUpdateLine(currentMois.id, line.id, "gp", e.target.value);
                            }}
                            className="w-full px-2 py-1.5 rounded border border-border text-xs font-bold bg-white focus:outline-none focus:border-rose cursor-pointer"
                          >
                            <option value="">—</option>
                            {"options" in col && col.options.map((o: string) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </td>
                      );
                    }

                    // Editable text cell (date reception, date envoi)
                    if (isEditable && !isSelect) {
                      if (isEditing) {
                        return (
                          <td key={col.key} className="px-2 py-1 border-b border-border">
                            <input
                              ref={inputRef}
                              type="text"
                              className="w-full px-2 py-1.5 text-xs font-semibold border border-rose rounded bg-white focus:outline-none"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEditing}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEditing();
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              placeholder="JJ/MM/AAAA"
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.key}
                          className="px-3 py-3 border-b border-border cursor-pointer hover:bg-rose/[0.04] transition-colors group/cell"
                          onClick={() => startEditing(line.id, col.key, String(value ?? ""))}
                        >
                          {value ? (
                            <span className="text-xs font-semibold">{String(value)}</span>
                          ) : (
                            <span className="text-xs text-muted/40 italic group-hover/cell:text-rose/50 transition-colors">
                              Cliquez pour saisir
                            </span>
                          )}
                        </td>
                      );
                    }

                    // Read-only cells (from Silae)
                    const isDsn = col.key === "dsn";
                    return (
                      <td key={col.key} className="px-3 py-3 border-b border-border">
                        {isDsn && value ? (
                          <span className={cn(
                            "text-[11px] font-extrabold px-2.5 py-1 rounded",
                            String(value).toUpperCase() === "OK" ? "bg-success-light text-success" : "bg-warning-light text-warning"
                          )}>
                            {String(value)}
                          </span>
                        ) : (
                          <span className={cn(
                            "text-xs font-semibold",
                            col.key === "nomDossier" ? "font-bold text-marine" : "text-foreground"
                          )}>
                            {value !== undefined && value !== null && value !== 0 ? String(value) : "—"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {/* Totals */}
            {lines.length > 0 && (
              <tfoot>
                <tr className="bg-marine/[0.03]">
                  <td className="px-3 py-3 border-t-2 border-marine/20 text-center text-xs font-extrabold text-marine">Σ</td>
                  {SUIVI_PAIE_COLUMNS.map((col) => {
                    let content = null;
                    if (col.key === "nomDossier") content = <span className="text-xs font-extrabold text-marine">{lines.length} dossiers</span>;
                    else if (col.key === "nombreBulletins") content = <span className="text-xs font-extrabold text-rose">{totalBulletins}</span>;
                    else if (col.key === "entrees") content = <span className="text-xs font-extrabold text-success">{totalEntrees || "—"}</span>;
                    else if (col.key === "sorties") content = <span className="text-xs font-extrabold text-danger">{totalSorties || "—"}</span>;
                    else if (col.key === "dsn") content = <span className="text-xs font-extrabold text-info">{dsnOk}/{lines.length}</span>;
                    else if (col.key === "bulletinsRefaits") {
                      const t = lines.reduce((s, l) => s + (l.bulletinsRefaits || 0), 0);
                      content = t > 0 ? <span className="text-xs font-extrabold text-warning">{t}</span> : null;
                    }
                    return <td key={col.key} className="px-3 py-3 border-t-2 border-marine/20">{content}</td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3">
        <span className="text-[11px] text-muted font-semibold">
          <span className="text-rose">*</span> Colonnes modifiables manuellement
        </span>
        <span className="text-[11px] text-muted font-semibold">
          Les autres colonnes sont alimentées automatiquement par Silae
        </span>
      </div>
    </div>
  );
}
