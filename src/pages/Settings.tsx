import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Member, AppConfig } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/constants";

interface SettingsProps {
  config: AppConfig;
  members: Member[];
  onSaveConfig: (config: AppConfig) => void;
  onAddMember: (member: Omit<Member, "id">) => void;
  onDeleteMember: (id: string) => void;
  onTestMissive: () => void;
  onTestSilae: () => void;
  onSyncDossiersSilae: () => void;
}

export function Settings({
  config,
  members,
  onSaveConfig,
  onAddMember,
  onDeleteMember,
  onTestMissive,
  onTestSilae,
  onSyncDossiersSilae,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<"general" | "missive" | "silae" | "team">("general");
  const [cabinet, setCabinet] = useState(config.cabinet);
  const [missiveBox, setMissiveBox] = useState(config.missiveBox);
  const [missiveLimit, setMissiveLimit] = useState(config.missiveLimit);
  const [newFirstname, setNewFirstname] = useState("");
  const [newLastname, setNewLastname] = useState("");
  const [newRole, setNewRole] = useState<Member["role"]>("gestionnaire");
  const [silaeStatus, setSilaeStatus] = useState<"unknown" | "checking" | "connected">("unknown");

  const tabs = [
    { id: "general" as const, label: "Général" },
    { id: "missive" as const, label: "Missive" },
    { id: "silae" as const, label: "Silae" },
    { id: "team" as const, label: "Équipe" },
  ];

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  const handleAddMember = () => {
    if (!newFirstname.trim() || !newLastname.trim()) return;
    onAddMember({ firstname: newFirstname.trim(), lastname: newLastname.trim(), role: newRole });
    setNewFirstname("");
    setNewLastname("");
  };

  const handleTestSilae = async () => {
    setSilaeStatus("checking");
    try {
      await onTestSilae();
      setSilaeStatus("connected");
    } catch {
      setSilaeStatus("unknown");
    }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 border-b-2 border-border mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-extrabold border-b-2 -mb-[2px] transition-all ${
              activeTab === tab.id
                ? "text-rose border-rose"
                : "text-muted border-transparent hover:text-marine"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General */}
      {activeTab === "general" && (
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="mb-4">
            <label className="block text-xs font-extrabold text-marine mb-1.5">
              Nom du cabinet
            </label>
            <input
              type="text"
              className={inputClass}
              value={cabinet}
              onChange={(e) => setCabinet(e.target.value)}
            />
          </div>
          <button
            onClick={() => onSaveConfig({ ...config, cabinet })}
            className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            Enregistrer
          </button>
        </div>
      )}

      {/* Missive */}
      {activeTab === "missive" && (
        <div className="bg-white border border-border rounded-lg p-6">
          <p className="text-sm text-muted font-semibold mb-4">
            La clé API Missive est configurée côté serveur (Supabase Edge Function).
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Type de boîte
              </label>
              <select
                className={inputClass}
                value={missiveBox}
                onChange={(e) => setMissiveBox(e.target.value as AppConfig["missiveBox"])}
              >
                <option value="inbox">Inbox</option>
                <option value="team_inbox">Team Inbox</option>
                <option value="all">Toutes</option>
                <option value="assigned">Assignées</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Limite de conversations
              </label>
              <input
                type="number"
                className={inputClass}
                value={missiveLimit}
                onChange={(e) => setMissiveLimit(parseInt(e.target.value) || 25)}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() =>
                onSaveConfig({ ...config, missiveBox, missiveLimit })
              }
              className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
            >
              Enregistrer
            </button>
            <button
              onClick={onTestMissive}
              className="px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all"
            >
              Tester la connexion
            </button>
          </div>
        </div>
      )}

      {/* Silae */}
      {activeTab === "silae" && (
        <div className="bg-white border border-border rounded-lg p-6">
          <p className="text-sm text-muted font-semibold mb-4">
            La connexion Silae est gérée via le serveur MCP intégré. Les données
            sont récupérées directement depuis l'API Silae.
          </p>
          <div className="mb-4">
            <label className="block text-xs font-extrabold text-marine mb-1.5">
              État de la connexion
            </label>
            <span
              className={`text-[11px] font-extrabold px-3 py-1 rounded ${
                silaeStatus === "connected"
                  ? "bg-success-light text-success"
                  : silaeStatus === "checking"
                  ? "bg-warning-light text-warning"
                  : "bg-marine-light text-muted"
              }`}
            >
              {silaeStatus === "connected"
                ? "✓ Connecté via MCP"
                : silaeStatus === "checking"
                ? "Vérification..."
                : "Non vérifié"}
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleTestSilae}
              className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
            >
              Tester la connexion
            </button>
            <button
              onClick={onSyncDossiersSilae}
              className="px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all"
            >
              Synchroniser les dossiers
            </button>
          </div>
        </div>
      )}

      {/* Team */}
      {activeTab === "team" && (
        <div className="bg-white border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-extrabold text-marine">
              Membres de l'équipe
            </h3>
          </div>

          {/* Add member form */}
          <div className="flex gap-3 mb-6 items-end">
            <div className="flex-1">
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Prénom
              </label>
              <input
                type="text"
                className={inputClass}
                value={newFirstname}
                onChange={(e) => setNewFirstname(e.target.value)}
                placeholder="Marie"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Nom
              </label>
              <input
                type="text"
                className={inputClass}
                value={newLastname}
                onChange={(e) => setNewLastname(e.target.value)}
                placeholder="Dupont"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-extrabold text-marine mb-1.5">
                Rôle
              </label>
              <select
                className={inputClass}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as Member["role"])}
              >
                <option value="gestionnaire">Gestionnaire de paie</option>
                <option value="responsable">Responsable RH</option>
                <option value="assistant">Assistant(e)</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <button
              onClick={handleAddMember}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>

          {/* Members list */}
          {members.length === 0 ? (
            <p className="text-sm text-muted font-semibold text-center py-4">
              Aucun membre dans l'équipe
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-3 border border-border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold">
                      {m.firstname} {m.lastname}
                    </span>
                    <span className="text-[11px] font-extrabold px-2 py-0.5 rounded bg-marine-light text-muted">
                      {ROLE_LABELS[m.role]}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteMember(m.id)}
                    className="p-1.5 rounded hover:bg-danger-light transition-colors text-muted hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
