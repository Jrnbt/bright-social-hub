import { FileText, Eye, Download } from "lucide-react";
import type { Report, Dossier } from "@/lib/types";
import { REPORT_TYPE_LABELS } from "@/lib/constants";
import { formatPeriod, formatDate, getCurrentPeriod } from "@/lib/utils";
import { useState } from "react";

interface ReportsProps {
  reports: Report[];
  dossiers: Dossier[];
  onGenerate: (dossierId: string, period: string, type: string) => void;
  onView: (id: string) => void;
  onExport: (id: string) => void;
}

export function Reports({
  reports,
  dossiers,
  onGenerate,
  onView,
  onExport,
}: ReportsProps) {
  const [dossierId, setDossierId] = useState("");
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [type, setType] = useState("full");

  const selectClass =
    "w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div>
      {/* Generation form */}
      <div className="bg-white border border-border rounded-lg shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-extrabold text-marine">
            Génération de rapports
          </h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-muted font-semibold mb-4">
            Générez des rapports de contrôle mensuels basés sur les données
            Silae. Les rapports incluent les vérifications de cotisations, les
            écarts détectés et les recommandations.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Dossier
              </label>
              <select
                className={selectClass}
                value={dossierId}
                onChange={(e) => setDossierId(e.target.value)}
              >
                <option value="">Sélectionner un dossier</option>
                {dossiers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nom} ({d.numero})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Période
              </label>
              <input
                type="month"
                className={selectClass}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-extrabold text-marine mb-1.5">
              Type de rapport
            </label>
            <select
              className={selectClass}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="full">Rapport complet (toutes vérifications)</option>
              <option value="cotisations">Vérification des cotisations</option>
              <option value="absences">Contrôle des absences</option>
              <option value="ecarts">Rapport des écarts uniquement</option>
            </select>
          </div>
          <button
            onClick={() => onGenerate(dossierId, period, type)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            <FileText size={14} /> Générer le rapport
          </button>
        </div>
      </div>

      {/* Reports list */}
      <div className="bg-white border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-extrabold text-marine">
            Rapports générés
          </h3>
        </div>
        <div className="p-5">
          {reports.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">📄</div>
              <h3 className="text-base font-extrabold text-marine">
                Aucun rapport
              </h3>
              <p className="text-sm text-muted font-semibold mt-1">
                Les rapports générés apparaîtront ici
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] font-extrabold uppercase tracking-wide text-muted bg-background px-4 py-2.5 border-b border-border">
                      Date
                    </th>
                    <th className="text-left text-[11px] font-extrabold uppercase tracking-wide text-muted bg-background px-4 py-2.5 border-b border-border">
                      Dossier
                    </th>
                    <th className="text-left text-[11px] font-extrabold uppercase tracking-wide text-muted bg-background px-4 py-2.5 border-b border-border">
                      Période
                    </th>
                    <th className="text-left text-[11px] font-extrabold uppercase tracking-wide text-muted bg-background px-4 py-2.5 border-b border-border">
                      Type
                    </th>
                    <th className="text-left text-[11px] font-extrabold uppercase tracking-wide text-muted bg-background px-4 py-2.5 border-b border-border">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-semibold border-b border-border">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-4 py-3 border-b border-border">
                        <div className="text-sm font-bold">{r.dossierName}</div>
                        <div className="text-xs text-muted">{r.dossierNumero}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold border-b border-border">
                        {formatPeriod(r.period)}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold border-b border-border">
                        {r.typeLabel}
                      </td>
                      <td className="px-4 py-3 border-b border-border">
                        <div className="flex gap-2">
                          <button
                            onClick={() => onView(r.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border text-xs font-bold hover:border-rose hover:text-rose transition-all"
                          >
                            <Eye size={12} /> Voir
                          </button>
                          <button
                            onClick={() => onExport(r.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-border text-xs font-bold hover:border-rose hover:text-rose transition-all"
                          >
                            <Download size={12} /> Exporter
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
