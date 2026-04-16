export interface Task {
  id: string;
  title: string;
  priority: "urgent" | "high" | "normal" | "low";
  category: "paie" | "rh" | "technique" | "administratif";
  assignee: string;
  due: string;
  dossier: string;
  description: string;
  status: "todo" | "progress" | "done";
  source: "manual" | "missive" | "silae";
  missiveId?: string;
  createdAt: string;
}

export interface Member {
  id: string;
  firstname: string;
  lastname: string;
  role: "gestionnaire" | "responsable" | "assistant" | "manager";
}

export interface Dossier {
  id: string;
  numero: string;
  nom: string;
  responsable: string;
  notes: string;
  createdAt: string;
  // Fiche société enrichie
  siret: string;
  ccn: string;
  dirigeant: string;
  adresse: string;
  codePostal: string;
  ville: string;
  telephone: string;
  email: string;
  typeAbonnement: string;
  modeEnvoi: string;
  edoc: boolean;
  conventionCollective: string;
  effectif: number | string;
  dateCreation: string;
  commentaires: string;
}

export interface ControlCheck {
  name: string;
  status: "pending" | "ok" | "ko" | "warn";
  detail: string;
}

export interface Control {
  id: string;
  dossierId: string;
  dossierName: string;
  dossierNumero: string;
  period: string;
  checks: ControlCheck[];
  status: "pending" | "ok" | "ko";
  createdAt: string;
  completedAt: string | null;
  notes: string;
}

export interface Report {
  id: string;
  dossierId: string;
  dossierName: string;
  dossierNumero: string;
  period: string;
  type: "full" | "cotisations" | "absences" | "ecarts";
  typeLabel: string;
  controls: { checks: ControlCheck[]; status: string }[];
  createdAt: string;
  status: string;
}

export interface SuiviPaieLine {
  id: string;
  numeroDossier: string;
  nomDossier: string;
  gp: "MA" | "NER" | "";
  dateReception: string;
  traitementPar: string;
  dateEnvoiBulletins: string;
  effectif: number;
  bsCalcules: number;
  entrees: number;
  sorties: number;
  bulletinsRefaits: number;
  fichierVirements: boolean;
  dsn: string;
  // Synced from Silae
  syncedFromSilae: boolean;
  lastSilaeSync: string;
}

export interface SuiviPaieMois {
  id: string;
  period: string;
  lines: SuiviPaieLine[];
  lastSyncAt: string;
}

export interface AppConfig {
  cabinet: string;
  missiveBox: "inbox" | "team_inbox" | "all" | "assigned";
  missiveLimit: number;
}

export interface VeilleArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  category: "legislation" | "jurisprudence" | "convention" | "social" | "autre";
  fetchedAt: string;
}

export type PageId =
  | "dashboard"
  | "tasks"
  | "team"
  | "suivi-paies"
  | "controls"
  | "dossiers"
  | "reports"
  | "actualites"
  | "assistant"
  | "settings";
