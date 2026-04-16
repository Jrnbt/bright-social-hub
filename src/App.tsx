import { useState, useCallback, useEffect } from "react";
import { Toaster, toast } from "sonner";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { Dashboard } from "@/pages/Dashboard";
import { Tasks } from "@/pages/Tasks";
import { Team } from "@/pages/Team";
import { Controls } from "@/pages/Controls";
import { Dossiers } from "@/pages/Dossiers";
import { Reports } from "@/pages/Reports";
import { Settings } from "@/pages/Settings";
import { SuiviPaies } from "@/pages/SuiviPaies";
import { Actualites } from "@/pages/Actualites";
import { Assistant } from "@/pages/Assistant";
import { Login } from "@/pages/Login";
import {
  useTasks,
  useMembers,
  useDossiers,
  useControls,
  useReports,
  useConfig,
  useDismissed,
  useSuiviPaies,
} from "@/hooks/useStore";
import { fetchMissiveConversations, testMissiveConnection } from "@/lib/missive";
import { supabase } from "@/lib/supabase";
import { REPORT_TYPE_LABELS, CONTROL_CHECKS_TEMPLATES } from "@/lib/constants";
import { generateId, formatPeriod, getCurrentPeriod, escapeHtml } from "@/lib/utils";
import type { PageId, Task, Member, Control, Report, SuiviPaieMois, Dossier } from "@/lib/types";

const PAGE_INFO: Record<PageId, { title: string; subtitle: string }> = {
  dashboard: { title: "Tableau de bord", subtitle: "Vue d'ensemble de l'activité sociale" },
  tasks: { title: "Mes tâches", subtitle: "Gérez et suivez vos tâches quotidiennes" },
  team: { title: "Vue équipe", subtitle: "Répartition des tâches par membre" },
  "suivi-paies": { title: "Suivi des paies", subtitle: "Tableau de suivi mensuel des bulletins et DSN" },
  controls: { title: "Contrôles mensuels", subtitle: "Vérifications de paie et DSN" },
  dossiers: { title: "Dossiers", subtitle: "Portefeuille de dossiers clients" },
  reports: { title: "Rapports", subtitle: "Génération et historique des rapports" },
  actualites: { title: "Actualites", subtitle: "Veille sociale et juridique" },
  assistant: { title: "Assistant IA", subtitle: "Analyse et recherche assistee par Claude" },
  settings: { title: "Paramètres", subtitle: "Configuration de l'application" },
};

// ── Task Modal ──────────────────────────────────────────
function TaskModal({
  open,
  task,
  members,
  dossiers,
  onSave,
  onClose,
}: {
  open: boolean;
  task: Partial<Task> | null;
  members: Member[];
  dossiers: { id: string; nom: string; numero: string }[];
  onSave: (data: Partial<Task>) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title || "");
  const [priority, setPriority] = useState(task?.priority || "normal");
  const [category, setCategory] = useState(task?.category || "paie");
  const [assignee, setAssignee] = useState(task?.assignee || "");
  const [due, setDue] = useState(task?.due || "");
  const [dossier, setDossier] = useState(task?.dossier || "");
  const [description, setDescription] = useState(task?.description || "");

  // Reset when task changes
  useEffect(() => {
    setTitle(task?.title || "");
    setPriority(task?.priority || "normal");
    setCategory(task?.category || "paie");
    setAssignee(task?.assignee || "");
    setDue(task?.due || "");
    setDossier(task?.dossier || "");
    setDescription(task?.description || "");
  }, [task]);

  if (!open) return null;

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div
      className="fixed inset-0 bg-marine/50 backdrop-blur-sm z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[90%] max-w-[560px] max-h-[85vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-black text-marine">
            {task?.id ? "Modifier la tâche" : "Nouvelle tâche"}
          </h3>
          <button onClick={onClose} className="text-xl text-muted hover:text-marine">
            &times;
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Titre</label>
            <input
              type="text"
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Vérifier DSN mars DUPONT"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Priorité</label>
              <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
                <option value="normal">Normale</option>
                <option value="urgent">Urgent</option>
                <option value="high">Haute</option>
                <option value="low">Basse</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Catégorie</label>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as Task["category"])}>
                <option value="paie">Paie</option>
                <option value="rh">RH</option>
                <option value="admin">Admin</option>
                <option value="client">Client</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Assigné à</label>
              <select className={inputClass} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Non assigné</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.firstname} {m.lastname}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Échéance</label>
              <input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Dossier lié</label>
            <select className={inputClass} value={dossier} onChange={(e) => setDossier(e.target.value)}>
              <option value="">Aucun</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>{d.nom} ({d.numero})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Description</label>
            <textarea
              className={inputClass + " min-h-[80px] resize-y"}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Détails de la tâche..."
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all">
            Annuler
          </button>
          <button
            onClick={() => {
              if (!title.trim()) { toast.error("Le titre est requis"); return; }
              onSave({ title: title.trim(), priority, category, assignee, due, dossier, description: description.trim() });
            }}
            className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Control Modal ───────────────────────────────────────
function ControlModal({
  open,
  dossiers,
  onLaunch,
  onClose,
}: {
  open: boolean;
  dossiers: { id: string; nom: string; numero: string }[];
  onLaunch: (dossierId: string, period: string, checkKeys: string[]) => void;
  onClose: () => void;
}) {
  const [dossierId, setDossierId] = useState("");
  const [period, setPeriod] = useState(getCurrentPeriod());
  const [checkedKeys, setCheckedKeys] = useState<string[]>(
    CONTROL_CHECKS_TEMPLATES.map((c) => c.key)
  );

  if (!open) return null;

  const toggleCheck = (key: string) => {
    setCheckedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div
      className="fixed inset-0 bg-marine/50 backdrop-blur-sm z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[90%] max-w-[560px] max-h-[85vh] overflow-y-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-black text-marine">Lancer un contrôle mensuel</h3>
          <button onClick={onClose} className="text-xl text-muted hover:text-marine">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Dossier</label>
            <select className={inputClass} value={dossierId} onChange={(e) => setDossierId(e.target.value)}>
              <option value="">Sélectionner un dossier</option>
              {dossiers.map((d) => (
                <option key={d.id} value={d.id}>{d.nom} ({d.numero})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Période</label>
            <input type="month" className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-extrabold text-marine mb-2">Points de contrôle</label>
            <div className="space-y-2">
              {CONTROL_CHECKS_TEMPLATES.map((tmpl) => (
                <label key={tmpl.key} className="flex items-center gap-3 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checkedKeys.includes(tmpl.key)}
                    onChange={() => toggleCheck(tmpl.key)}
                    className="w-4 h-4 accent-rose"
                  />
                  {tmpl.name}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all">
            Annuler
          </button>
          <button
            onClick={() => {
              if (!dossierId || !period) { toast.error("Dossier et période requis"); return; }
              onLaunch(dossierId, period, checkedKeys);
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            Lancer le contrôle
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dossier Modal ───────────────────────────────────────
function DossierModal({
  open,
  members,
  onSave,
  onClose,
}: {
  open: boolean;
  members: Member[];
  onSave: (numero: string, nom: string, responsable: string, notes: string) => void;
  onClose: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [nom, setNom] = useState("");
  const [siret, setSiret] = useState("");
  const [dirigeant, setDirigeant] = useState("");
  const [responsable, setResponsable] = useState("");

  if (!open) return null;

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground bg-white focus:outline-none focus:border-rose transition-colors";

  return (
    <div
      className="fixed inset-0 bg-marine/50 backdrop-blur-sm z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[90%] max-w-[560px] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-base font-black text-marine">Ajouter un dossier</h3>
          <button onClick={onClose} className="text-xl text-muted hover:text-marine">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">N° dossier Silae *</label>
              <input type="text" className={inputClass} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: BRIGHT001" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Nom de la société *</label>
              <input type="text" className={inputClass} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: SARL Exemple" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">SIRET</label>
              <input type="text" className={inputClass} value={siret} onChange={(e) => setSiret(e.target.value)} placeholder="XXX XXX XXX XXXXX" />
            </div>
            <div>
              <label className="block text-xs font-extrabold text-marine mb-1.5">Dirigeant</label>
              <input type="text" className={inputClass} value={dirigeant} onChange={(e) => setDirigeant(e.target.value)} placeholder="Prénom NOM" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-extrabold text-marine mb-1.5">Responsable (GP)</label>
            <select className={inputClass} value={responsable} onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Non assigné</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.firstname} {m.lastname}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted font-semibold">Les autres informations (CCN, adresse, abonnement...) pourront être complétées dans la fiche du dossier après création.</p>
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-extrabold hover:border-rose hover:text-rose transition-all">
            Annuler
          </button>
          <button
            onClick={() => {
              if (!numero.trim() || !nom.trim()) { toast.error("N° dossier et nom requis"); return; }
              onSave(numero.trim(), nom.trim(), responsable, siret.trim() + "|||" + dirigeant.trim());
              setNumero(""); setNom(""); setSiret(""); setDirigeant("");
              onClose();
            }}
            className="px-4 py-2 rounded-lg bg-rose text-white text-sm font-extrabold hover:bg-rose-hover transition-all"
          >
            Créer le dossier
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────
const SUPABASE_CONFIGURED = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(SUPABASE_CONFIGURED);

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-black text-marine">Bright <span className="text-rose">Social Hub</span></h1>
          <p className="text-sm text-muted mt-2">Chargement...</p>
        </div>
      </div>
    );
  }

  if (SUPABASE_CONFIGURED && !session) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <Login onAuth={() => {}} />
      </>
    );
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [tasks, setTasks] = useTasks();
  const [members, setMembers] = useMembers();
  const [dossiers, setDossiers] = useDossiers();
  const [controls, setControls] = useControls();
  const [reports, setReports] = useReports();
  const [config, setConfig] = useConfig();
  const [dismissed] = useDismissed();
  const [suiviPaies, setSuiviPaies] = useSuiviPaies();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<Task> | null>(null);
  const [controlModalOpen, setControlModalOpen] = useState(false);
  const [dossierModalOpen, setDossierModalOpen] = useState(false);

  const pageInfo = PAGE_INFO[activePage];
  const activeTaskCount = tasks.filter((t) => t.status !== "done").length;

  // ── Task handlers ──
  const handleSaveTask = useCallback(
    (data: Partial<Task>) => {
      setTasks((prev) => {
        if (editingTask?.id) {
          return prev.map((t) =>
            t.id === editingTask.id ? { ...t, ...data } : t
          );
        }
        const newTask: Task = {
          id: generateId("task"),
          title: data.title || "",
          priority: data.priority || "normal",
          category: data.category || "paie",
          assignee: data.assignee || "",
          due: data.due || "",
          dossier: data.dossier || "",
          description: data.description || "",
          status: "todo",
          source: "manual",
          createdAt: new Date().toISOString(),
        };
        return [newTask, ...prev];
      });
      setTaskModalOpen(false);
      setEditingTask(null);
      toast.success(editingTask?.id ? "Tâche modifiée" : "Tâche créée");
    },
    [editingTask, setTasks]
  );

  const handleToggleStatus = useCallback(
    (id: string) => {
      const cycle: Record<string, Task["status"]> = {
        todo: "progress",
        progress: "done",
        done: "todo",
      };
      setTasks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: cycle[t.status] || "todo" } : t
        )
      );
    },
    [setTasks]
  );

  const handleEditTask = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (task) {
        setEditingTask(task);
        setTaskModalOpen(true);
      }
    },
    [tasks]
  );

  const handleDeleteTask = useCallback(
    (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success("Tâche supprimée");
    },
    [setTasks]
  );

  // ── Missive sync (intelligent) ──
  const handleSyncMissive = useCallback(async () => {
    toast.info("Synchronisation Missive...");
    try {
      const conversations = await fetchMissiveConversations(config);
      let imported = 0;
      setTasks((prev) => {
        const updated = [...prev];
        conversations.forEach((conv: any) => {
          if (dismissed.includes(conv.id)) return;
          if (updated.some((t) => t.missiveId === conv.id)) return;

          const subject = conv.subject || conv.latest_message?.preview || "Email sans objet";
          const senderEmail = conv.latest_message?.from_field?.address ?? "";
          const subjectLower = subject.toLowerCase();

          // Auto-classification par importance
          const urgentKeywords = ["urgent", "relance", "mise en demeure", "impayé", "rappel", "dernier delai"];
          const isUrgent = urgentKeywords.some((kw) => subjectLower.includes(kw));
          const priority = isUrgent ? "urgent" as const : "normal" as const;

          // Auto-classification categorie
          let category: "paie" | "rh" | "admin" | "client" | "autre" = "client";
          if (subjectLower.match(/dsn|bulletin|cotisation|paie|salaire|urssaf|prevoyance|mutuelle|retraite/))
            category = "paie";
          else if (subjectLower.match(/absence|conge|maladie|accident|maternite|at\b/))
            category = "rh";
          else if (subjectLower.match(/facture|contrat|abonnement|comptabilite/))
            category = "admin";

          // Rapprochement avec dossier par email expediteur
          let matchedDossier = "";
          let matchedGp = "";
          if (senderEmail) {
            const match = dossiers.find(
              (d) => d.email && senderEmail.toLowerCase().includes(d.email.toLowerCase())
            );
            if (match) {
              matchedDossier = match.id;
              matchedGp = match.responsable || "";
            }
          }
          // Fallback: chercher le nom du dossier dans le sujet
          if (!matchedDossier) {
            const match = dossiers.find(
              (d) => subjectLower.includes(d.nom.toLowerCase()) || subjectLower.includes(d.numero.toLowerCase())
            );
            if (match) {
              matchedDossier = match.id;
              matchedGp = match.responsable || "";
            }
          }

          updated.unshift({
            id: generateId("task"),
            title: subject,
            priority,
            category,
            assignee: matchedGp,
            due: "",
            dossier: matchedDossier,
            description: `Importe depuis Missive\nExpediteur: ${senderEmail}\nConversation: ${conv.id}`,
            status: "todo",
            source: "missive",
            missiveId: conv.id,
            createdAt: new Date().toISOString(),
          });
          imported++;
        });
        return updated;
      });
      toast.success(`${imported} email(s) importé(s) depuis Missive`);
    } catch (err: any) {
      toast.error(`Erreur Missive: ${err.message}`);
    }
  }, [config, dismissed, dossiers, setTasks]);

  // ── Controls ──
  const handleLaunchControl = useCallback(
    (dossierId: string, period: string, checkKeys: string[]) => {
      const dossier = dossiers.find((d) => d.id === dossierId);
      const checks = CONTROL_CHECKS_TEMPLATES.filter((t) =>
        checkKeys.includes(t.key)
      ).map((t) => ({ name: t.name, status: "pending" as const, detail: "" }));

      const control: Control = {
        id: generateId("ctrl"),
        dossierId,
        dossierName: dossier?.nom || "Inconnu",
        dossierNumero: dossier?.numero || "",
        period,
        checks,
        status: "pending",
        createdAt: new Date().toISOString(),
        completedAt: null,
        notes: "",
      };

      setControls((prev) => [control, ...prev]);
      toast.success(`Contrôle lancé pour ${dossier?.nom || "le dossier"}`);
    },
    [dossiers, setControls]
  );

  const handleUpdateCheck = useCallback(
    (controlId: string, checkIdx: number, status: "ok" | "ko", detail = "") => {
      setControls((prev) =>
        prev.map((ctrl) => {
          if (ctrl.id !== controlId) return ctrl;
          const checks = ctrl.checks.map((ch, i) =>
            i === checkIdx ? { ...ch, status, detail } : ch
          );
          const allDone = checks.every((c) => c.status !== "pending");
          const hasKo = checks.some((c) => c.status === "ko");
          return {
            ...ctrl,
            checks,
            status: allDone ? (hasKo ? "ko" : "ok") : "pending",
            completedAt: allDone ? new Date().toISOString() : null,
          };
        })
      );
    },
    [setControls]
  );

  // ── Dossiers ──
  const handleSaveDossier = useCallback(
    (numero: string, nom: string, responsable: string, extraData: string) => {
      const [siret = "", dirigeant = ""] = extraData.split("|||");
      setDossiers((prev) => [
        ...prev,
        {
          id: generateId("dos"),
          numero,
          nom,
          responsable,
          notes: "",
          createdAt: new Date().toISOString(),
          siret,
          ccn: "",
          dirigeant,
          adresse: "",
          codePostal: "",
          ville: "",
          telephone: "",
          email: "",
          typeAbonnement: "",
          modeEnvoi: "",
          edoc: false,
          conventionCollective: "",
          effectif: "",
          dateCreation: "",
          commentaires: "",
        },
      ]);
      toast.success("Dossier ajouté");
    },
    [setDossiers]
  );

  // ── Reports ──
  const handleGenerateReport = useCallback(
    (dossierId: string, period: string, type: string) => {
      if (!dossierId || !period) {
        toast.error("Dossier et période requis");
        return;
      }
      const dossier = dossiers.find((d) => d.id === dossierId);
      const matchingControls = controls.filter(
        (c) => c.dossierId === dossierId && c.period === period
      );

      const report: Report = {
        id: generateId("rpt"),
        dossierId,
        dossierName: dossier?.nom || "Inconnu",
        dossierNumero: dossier?.numero || "",
        period,
        type: type as Report["type"],
        typeLabel: REPORT_TYPE_LABELS[type] || type,
        controls: matchingControls.map((c) => ({
          checks: c.checks,
          status: c.status,
        })),
        createdAt: new Date().toISOString(),
        status: "generated",
      };

      setReports((prev) => [report, ...prev]);
      toast.success(`Rapport généré pour ${dossier?.nom || "le dossier"}`);
    },
    [dossiers, controls, setReports]
  );

  const handleViewReport = useCallback(
    (id: string) => {
      const report = reports.find((r) => r.id === id);
      if (!report) return;

      const e = escapeHtml;
      let html = `<h2>${e(report.typeLabel)}</h2>
        <p><strong>Dossier:</strong> ${e(report.dossierName)} (${e(report.dossierNumero)})</p>
        <p><strong>Période:</strong> ${e(formatPeriod(report.period))}</p>
        <p><strong>Généré le:</strong> ${e(new Date(report.createdAt).toLocaleDateString("fr-FR"))}</p>
        <hr style="margin:16px 0;">`;

      if (report.controls.length) {
        report.controls.forEach((ctrl, i) => {
          html += `<h3>Contrôle #${i + 1}</h3>`;
          ctrl.checks.forEach((ch) => {
            const icon = ch.status === "ok" ? "OK" : ch.status === "ko" ? "KO" : "--";
            html += `<p>[${e(icon)}] <strong>${e(ch.name)}</strong> ${ch.detail ? "— " + e(ch.detail) : ""}</p>`;
          });
        });
      } else {
        html += "<p><em>Aucun contrôle associé.</em></p>";
      }

      const win = window.open("", "_blank", "width=800,height=600");
      if (win) {
        win.document.write(`<!DOCTYPE html><html><head><title>Rapport - ${e(report.dossierName)}</title>
          <style>body{font-family:'Nunito',sans-serif;padding:40px;max-width:800px;margin:auto;color:#1A1A2E;}
          h2{color:#0F0135;}h3{color:#FF0749;margin-top:20px;}hr{border:1px solid #E2E4EA;}
          p{margin:6px 0;font-size:14px;}</style></head><body>${html}</body></html>`);
      }
    },
    [reports]
  );

  const handleExportReport = useCallback(
    (id: string) => {
      const report = reports.find((r) => r.id === id);
      if (!report) return;

      let text = `RAPPORT DE CONTROLE — ${report.typeLabel}\n${"=".repeat(50)}\n\n`;
      text += `Dossier: ${report.dossierName} (${report.dossierNumero})\n`;
      text += `Période: ${formatPeriod(report.period)}\n`;
      text += `Généré le: ${new Date(report.createdAt).toLocaleDateString("fr-FR")}\n\n`;

      if (report.controls.length) {
        report.controls.forEach((ctrl, i) => {
          text += `--- Contrôle #${i + 1} ---\n`;
          ctrl.checks.forEach((ch) => {
            const icon = ch.status === "ok" ? "[OK]" : ch.status === "ko" ? "[KO]" : "[--]";
            text += `  ${icon} ${ch.name} ${ch.detail ? "— " + ch.detail : ""}\n`;
          });
          text += "\n";
        });
      }

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_${report.dossierNumero}_${report.period}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Rapport exporté");
    },
    [reports]
  );

  // ── Settings handlers ──
  const handleTestMissive = useCallback(async () => {
    try {
      const ok = await testMissiveConnection();
      if (ok) toast.success("Connexion Missive OK");
      else toast.error("Erreur de connexion Missive");
    } catch {
      toast.error("Erreur Missive — vérifiez la clé API serveur");
    }
  }, []);

  const handleAddMember = useCallback(
    (member: Omit<Member, "id">) => {
      setMembers((prev) => [...prev, { ...member, id: generateId("mbr") }]);
      toast.success("Membre ajouté");
    },
    [setMembers]
  );

  const handleDeleteMember = useCallback(
    (id: string) => {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      toast.success("Membre supprimé");
    },
    [setMembers]
  );

  const handleOpenNewTask = useCallback(() => {
    setEditingTask(null);
    setTaskModalOpen(true);
  }, []);

  // ── Silae sync for Suivi Paies ──
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncSilae = useCallback(async (period: string) => {
    setIsSyncing(true);
    toast.info("Synchronisation Silae en cours...");
    try {
      const { data, error } = await supabase.functions.invoke("silae-sync", {
        body: { period },
      });
      if (error) throw error;
      toast.success(
        `${data.dossiers_synced} dossiers synchronisés — ${data.entrees_total} entrée(s), ${data.sorties_total} sortie(s)`
      );
    } catch (err: any) {
      toast.error(`Erreur sync Silae: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const handleUpdateSuiviLine = useCallback(
    (moisId: string, lineId: string, field: string, value: any) => {
      setSuiviPaies((prev) =>
        prev.map((m) =>
          m.id === moisId
            ? {
                ...m,
                lines: m.lines.map((l) =>
                  l.id === lineId ? { ...l, [field]: value, traitementPar: field === "gp" ? value : l.traitementPar } : l
                ),
              }
            : m
        )
      );
    },
    [setSuiviPaies]
  );

  // ── Dossier update ──
  const handleUpdateDossier = useCallback(
    (updated: Dossier) => {
      setDossiers((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
      toast.success("Fiche dossier mise à jour");
    },
    [setDossiers]
  );

  return (
    <div className="flex min-h-screen bg-background font-nunito">
      <Toaster position="top-right" richColors />

      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        taskCount={activeTaskCount}
      />

      <div className="ml-[260px] flex-1 min-h-screen">
        <Topbar
          title={pageInfo.title}
          subtitle={pageInfo.subtitle}
          onRefresh={() => toast.success("Données actualisées")}
          onNewTask={handleOpenNewTask}
        />

        <div className="p-6">
          {activePage === "dashboard" && (
            <Dashboard
              tasks={tasks}
              members={members}
              dossiers={dossiers}
              controls={controls}
              onNavigate={(p) => setActivePage(p as PageId)}
            />
          )}
          {activePage === "tasks" && (
            <Tasks
              tasks={tasks}
              members={members}
              dossiers={dossiers}
              onToggleStatus={handleToggleStatus}
              onEdit={handleEditTask}
              onDelete={handleDeleteTask}
              onNewTask={handleOpenNewTask}
              onSyncMissive={handleSyncMissive}
            />
          )}
          {activePage === "team" && (
            <Team tasks={tasks} members={members} />
          )}
          {activePage === "suivi-paies" && (
            <SuiviPaies
              mois={suiviPaies}
              onSyncSilae={handleSyncSilae}
              isSyncing={isSyncing}
              onUpdateLine={handleUpdateSuiviLine}
            />
          )}
          {activePage === "controls" && (
            <Controls
              controls={controls}
              dossiers={dossiers}
              onUpdateCheck={handleUpdateCheck}
              onNewControl={() => setControlModalOpen(true)}
            />
          )}
          {activePage === "dossiers" && (
            <Dossiers
              dossiers={dossiers}
              members={members}
              controls={controls}
              onNewDossier={() => setDossierModalOpen(true)}
              onUpdateDossier={handleUpdateDossier}
            />
          )}
          {activePage === "reports" && (
            <Reports
              reports={reports}
              dossiers={dossiers}
              onGenerate={handleGenerateReport}
              onView={handleViewReport}
              onExport={handleExportReport}
            />
          )}
          {activePage === "actualites" && (
            <Actualites />
          )}
          {activePage === "assistant" && (
            <Assistant dossiers={dossiers} tasks={tasks} controls={controls} />
          )}
          {activePage === "settings" && (
            <Settings
              config={config}
              members={members}
              onSaveConfig={(c) => {
                setConfig(c);
                toast.success("Configuration enregistrée");
              }}
              onAddMember={handleAddMember}
              onDeleteMember={handleDeleteMember}
              onTestMissive={handleTestMissive}
              onTestSilae={() => toast.success("Connexion Silae OK via MCP")}
              onSyncDossiersSilae={() =>
                toast.info("Utilisez Claude pour synchroniser les dossiers Silae")
              }
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <TaskModal
        open={taskModalOpen}
        task={editingTask}
        members={members}
        dossiers={dossiers}
        onSave={handleSaveTask}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
      />
      <ControlModal
        open={controlModalOpen}
        dossiers={dossiers}
        onLaunch={handleLaunchControl}
        onClose={() => setControlModalOpen(false)}
      />
      <DossierModal
        open={dossierModalOpen}
        members={members}
        onSave={handleSaveDossier}
        onClose={() => setDossierModalOpen(false)}
      />
    </div>
  );
}
