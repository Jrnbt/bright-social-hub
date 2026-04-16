export const SUIVI_PAIE_COLUMNS = [
  { key: "nomDossier", label: "Nom dossier", width: 200, editable: false },
  { key: "gp", label: "GP", width: 80, editable: true, type: "select" as const, options: ["MA", "NER"] },
  { key: "dateReception", label: "Date de réception", width: 140, editable: true },
  { key: "traitementPar", label: "Traitement par", width: 120, editable: false },
  { key: "dateEnvoiBulletins", label: "Date d'envoi BS", width: 150, editable: true },
  { key: "effectif", label: "Effectif", width: 80, editable: false, type: "number" as const },
  { key: "bsCalcules", label: "BS calculés", width: 100, editable: false, type: "number" as const },
  { key: "entrees", label: "Entrées", width: 80, editable: false, type: "number" as const },
  { key: "sorties", label: "Sorties", width: 80, editable: false, type: "number" as const },
  { key: "bulletinsRefaits", label: "BS refaits", width: 90, editable: false, type: "number" as const },
  { key: "fichierVirements", label: "Fich. virements", width: 110, editable: false, type: "boolean" as const },
  { key: "dsn", label: "DSN", width: 80, editable: false },
] as const;

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "Haute",
  normal: "Normale",
  low: "Basse",
};

export const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-danger-light text-danger",
  high: "bg-warning-light text-warning",
  normal: "bg-blue-100 text-blue-700",
  low: "bg-success-light text-success",
};

export const PRIORITY_DOTS: Record<string, string> = {
  urgent: "bg-danger",
  high: "bg-warning",
  normal: "bg-blue-400",
  low: "bg-success",
};

export const STATUS_LABELS: Record<string, string> = {
  todo: "À faire",
  progress: "En cours",
  done: "Terminé",
};

export const STATUS_COLORS: Record<string, string> = {
  todo: "bg-danger-light text-danger",
  progress: "bg-warning-light text-warning",
  done: "bg-success-light text-success",
};

export const CATEGORY_LABELS: Record<string, string> = {
  paie: "Paie",
  rh: "RH",
  technique: "Technique",
  administratif: "Administratif",
};

export const ROLE_LABELS: Record<string, string> = {
  gestionnaire: "Gestionnaire de paie",
  responsable: "Responsable RH",
  assistant: "Assistant(e)",
  manager: "Manager",
};

export const REPORT_TYPE_LABELS: Record<string, string> = {
  full: "Rapport complet",
  cotisations: "Vérification cotisations",
  absences: "Contrôle absences",
  ecarts: "Rapport écarts",
};

export const DEFAULT_CONFIG = {
  cabinet: "Bright Conseil",
  missiveBox: "inbox" as const,
  missiveLimit: 25,
};

export const CONTROL_CHECKS_TEMPLATES = [
  { name: "Cohérence Brut / Net", key: "brut-net" },
  { name: "Vérification des cotisations", key: "cotisations" },
  { name: "Contrôle des absences", key: "absences" },
  { name: "Vérification des plafonds", key: "plafonds" },
  { name: "Contrôle des exonérations", key: "exonerations" },
];
