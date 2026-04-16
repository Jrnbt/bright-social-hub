import { useState } from "react";
import { Plus, Search, X, Building2, MapPin, FileText, Pencil, Save, ChevronDown, ChevronUp } from "lucide-react";
import type { Dossier, Member, Control } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DossiersProps {
  dossiers: Dossier[];
  members: Member[];
  controls: Control[];
  onNewDossier: () => void;
  onUpdateDossier: (dossier: Dossier) => void;
}

function FicheField({
  label,
  value,
  editing,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-extrabold uppercase tracking-wide text-muted mb-1">{label}</label>
      {editing ? (
        type === "textarea" ? (
          <textarea
            className="w-full px-2.5 py-1.5 rounded border border-border text-xs font-semibold bg-white focus:outline-none focus:border-rose resize-y min-h-[60px]"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <input
            type={type}
            className="w-full px-2.5 py-1.5 rounded border border-border text-xs font-semibold bg-white focus:outline-none focus:border-rose"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        )
      ) : (
        <p className="text-sm font-semibold text-foreground min-h-[24px]">
          {value || <span className="text-muted/40 italic text-xs">Non renseigné</span>}
        </p>
      )}
    </div>
  );
}

function DossierFiche({
  dossier,
  members,
  controls,
  onUpdate,
}: {
  dossier: Dossier;
  members: Member[];
  controls: Control[];
  onUpdate: (d: Dossier) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Dossier>(dossier);

  const resp = members.find((m) => m.id === dossier.responsable);
  const dossierControls = controls.filter((c) => c.dossierId === dossier.id);
  const lastControl = dossierControls[0];

  const handleSave = () => {
    onUpdate(draft);
    setEditing(false);
  };
  const handleCancel = () => {
    setDraft(dossier);
    setEditing(false);
  };
  const set = (field: keyof Dossier, value: any) => setDraft((d) => ({ ...d, [field]: value }));

  return (
    <div className="bg-white border border-border rounded-lg shadow-sm overflow-hidden transition-all">
      {/* Card header — always visible */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-rose/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-10 rounded-lg bg-marine flex items-center justify-center flex-shrink-0">
          <Building2 size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-extrabold text-marine truncate">{dossier.nom}</div>
          <div className="text-xs text-muted font-semibold">
            N° {dossier.numero}
            {dossier.siret && <span className="ml-2">SIRET: {dossier.siret}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {resp && (
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-info-light text-info">
              {resp.firstname}
            </span>
          )}
          {lastControl && (
            <span className={cn(
              "text-[11px] font-extrabold px-2 py-0.5 rounded",
              lastControl.status === "ok" ? "bg-success-light text-success" : lastControl.status === "ko" ? "bg-danger-light text-danger" : "bg-warning-light text-warning"
            )}>
              {lastControl.status === "ok" ? "Conforme" : lastControl.status === "ko" ? "Anomalie" : "En attente"}
            </span>
          )}
          {expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
        </div>
      </div>

      {/* Expanded fiche */}
      {expanded && (
        <div className="border-t border-border">
          {/* Action bar */}
          <div className="flex items-center justify-end gap-2 px-5 py-2 bg-background/50">
            {editing ? (
              <>
                <button onClick={handleCancel} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs font-bold hover:border-danger hover:text-danger transition-all">
                  <X size={12} /> Annuler
                </button>
                <button onClick={handleSave} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose text-white text-xs font-extrabold hover:bg-rose-hover transition-all">
                  <Save size={12} /> Enregistrer
                </button>
              </>
            ) : (
              <button onClick={() => { setDraft(dossier); setEditing(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-xs font-bold hover:border-rose hover:text-rose transition-all">
                <Pencil size={12} /> Modifier la fiche
              </button>
            )}
          </div>

          <div className="px-5 py-4">
            {/* Section: Identité */}
            <div className="mb-5">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-rose mb-3 flex items-center gap-2">
                <Building2 size={12} /> Identité société
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <FicheField label="SIRET" value={draft.siret} editing={editing} onChange={(v) => set("siret", v)} placeholder="XXX XXX XXX XXXXX" />
                <FicheField label="Nom société" value={draft.nom} editing={editing} onChange={(v) => set("nom", v)} />
                <FicheField label="Dirigeant" value={draft.dirigeant} editing={editing} onChange={(v) => set("dirigeant", v)} placeholder="Prénom NOM" />
                <FicheField label="Convention collective (CCN)" value={draft.ccn} editing={editing} onChange={(v) => set("ccn", v)} placeholder="Ex: 1486 - Syntec" />
                <FicheField label="Date de création" value={draft.dateCreation} editing={editing} onChange={(v) => set("dateCreation", v)} placeholder="JJ/MM/AAAA" />
                <FicheField label="Effectif" value={String(draft.effectif || "")} editing={editing} onChange={(v) => set("effectif", v)} placeholder="Nombre de salariés" />
              </div>
            </div>

            {/* Section: Coordonnées */}
            <div className="mb-5">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-rose mb-3 flex items-center gap-2">
                <MapPin size={12} /> Coordonnées
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <FicheField label="Adresse" value={draft.adresse} editing={editing} onChange={(v) => set("adresse", v)} />
                <FicheField label="Code postal" value={draft.codePostal} editing={editing} onChange={(v) => set("codePostal", v)} />
                <FicheField label="Ville" value={draft.ville} editing={editing} onChange={(v) => set("ville", v)} />
                <FicheField label="Téléphone" value={draft.telephone} editing={editing} onChange={(v) => set("telephone", v)} placeholder="01 23 45 67 89" />
                <FicheField label="Email" value={draft.email} editing={editing} onChange={(v) => set("email", v)} placeholder="contact@societe.fr" />
              </div>
            </div>

            {/* Section: Paie & Abonnement */}
            <div className="mb-5">
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-rose mb-3 flex items-center gap-2">
                <FileText size={12} /> Paie & Abonnement
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <FicheField label="N° dossier Silae" value={draft.numero} editing={editing} onChange={(v) => set("numero", v)} />
                <FicheField label="Type d'abonnement" value={draft.typeAbonnement} editing={editing} onChange={(v) => set("typeAbonnement", v)} placeholder="Mensuel, Annuel, Semestriel..." />
                <FicheField label="Mode d'envoi BS/DSN" value={draft.modeEnvoi} editing={editing} onChange={(v) => set("modeEnvoi", v)} placeholder="Welyb, Edoc, @..." />
                <FicheField label="Convention collective" value={draft.conventionCollective} editing={editing} onChange={(v) => set("conventionCollective", v)} />
                <div className="flex items-center gap-3 pt-4">
                  <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.edoc}
                      onChange={(e) => editing && set("edoc", e.target.checked)}
                      disabled={!editing}
                      className="w-4 h-4 accent-rose"
                    />
                    E-doc activé
                  </label>
                </div>
                {editing && (
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase tracking-wide text-muted mb-1">Responsable</label>
                    <select
                      className="w-full px-2.5 py-1.5 rounded border border-border text-xs font-semibold bg-white focus:outline-none focus:border-rose"
                      value={draft.responsable}
                      onChange={(e) => set("responsable", e.target.value)}
                    >
                      <option value="">Non assigné</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.firstname} {m.lastname}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Section: Notes */}
            <div>
              <h4 className="text-[11px] font-extrabold uppercase tracking-widest text-rose mb-3">Notes & Commentaires</h4>
              <FicheField label="" value={draft.commentaires} editing={editing} onChange={(v) => set("commentaires", v)} type="textarea" placeholder="Informations complémentaires sur le dossier..." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Dossiers({ dossiers, members, controls, onNewDossier, onUpdateDossier }: DossiersProps) {
  const [search, setSearch] = useState("");

  const filtered = dossiers.filter(
    (d) =>
      d.nom.toLowerCase().includes(search.toLowerCase()) ||
      d.numero.toLowerCase().includes(search.toLowerCase()) ||
      (d.siret || "").toLowerCase().includes(search.toLowerCase()) ||
      (d.dirigeant || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Rechercher par nom, n°, SIRET, dirigeant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors w-80"
          />
        </div>
        <span className="text-xs font-bold text-muted">{filtered.length} dossier(s)</span>
        <div className="ml-auto">
          <button
            onClick={onNewDossier}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            <Plus size={14} /> Ajouter un dossier
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏢</div>
          <h3 className="text-base font-extrabold text-marine">Aucun dossier</h3>
          <p className="text-sm text-muted font-semibold mt-1">
            Ajoutez des dossiers ou synchronisez depuis Silae
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <DossierFiche
              key={d.id}
              dossier={d}
              members={members}
              controls={controls}
              onUpdate={onUpdateDossier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
