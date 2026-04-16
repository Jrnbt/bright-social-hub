-- Bright Social Hub — Schema initial
-- Genere le 2026-04-15

-- Enums
CREATE TYPE task_priority AS ENUM ('urgent', 'high', 'normal', 'low');
CREATE TYPE task_category AS ENUM ('paie', 'rh', 'admin', 'client', 'autre');
CREATE TYPE task_status AS ENUM ('todo', 'progress', 'done');
CREATE TYPE task_source AS ENUM ('manual', 'missive', 'silae');
CREATE TYPE member_role AS ENUM ('gestionnaire', 'responsable', 'assistant', 'manager');
CREATE TYPE check_status AS ENUM ('pending', 'ok', 'ko', 'warn');
CREATE TYPE control_status AS ENUM ('pending', 'ok', 'ko');
CREATE TYPE report_type AS ENUM ('full', 'cotisations', 'absences', 'ecarts');

-- Trigger auto updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Members
CREATE TABLE members (
  id text PRIMARY KEY,
  firstname text NOT NULL,
  lastname text NOT NULL,
  role member_role NOT NULL DEFAULT 'gestionnaire',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_members BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Dossiers
CREATE TABLE dossiers (
  id text PRIMARY KEY,
  numero text NOT NULL UNIQUE,
  nom text NOT NULL,
  responsable text REFERENCES members(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  siret text NOT NULL DEFAULT '',
  ccn text NOT NULL DEFAULT '',
  dirigeant text NOT NULL DEFAULT '',
  adresse text NOT NULL DEFAULT '',
  code_postal text NOT NULL DEFAULT '',
  ville text NOT NULL DEFAULT '',
  telephone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  type_abonnement text NOT NULL DEFAULT '',
  mode_envoi text NOT NULL DEFAULT '',
  edoc boolean NOT NULL DEFAULT false,
  convention_collective text NOT NULL DEFAULT '',
  effectif integer NOT NULL DEFAULT 0,
  date_creation text NOT NULL DEFAULT '',
  commentaires text NOT NULL DEFAULT '',
  synced_from_silae boolean NOT NULL DEFAULT false,
  last_silae_sync timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dossiers_numero ON dossiers(numero);
CREATE TRIGGER trg_dossiers BEFORE UPDATE ON dossiers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tasks
CREATE TABLE tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  priority task_priority NOT NULL DEFAULT 'normal',
  category task_category NOT NULL DEFAULT 'paie',
  assignee text REFERENCES members(id) ON DELETE SET NULL,
  due text NOT NULL DEFAULT '',
  dossier text REFERENCES dossiers(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  status task_status NOT NULL DEFAULT 'todo',
  source task_source NOT NULL DEFAULT 'manual',
  missive_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee);
CREATE TRIGGER trg_tasks BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Controls
CREATE TABLE controls (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  dossier_name text NOT NULL,
  dossier_numero text NOT NULL,
  period text NOT NULL,
  status control_status NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_controls_period ON controls(period);
CREATE TRIGGER trg_controls BEFORE UPDATE ON controls FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Control checks (normalise depuis le tableau embarque)
CREATE TABLE control_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  control_id text NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
  idx integer NOT NULL,
  name text NOT NULL,
  status check_status NOT NULL DEFAULT 'pending',
  detail text NOT NULL DEFAULT '',
  UNIQUE(control_id, idx)
);

-- Reports
CREATE TABLE reports (
  id text PRIMARY KEY,
  dossier_id text NOT NULL REFERENCES dossiers(id) ON DELETE CASCADE,
  dossier_name text NOT NULL,
  dossier_numero text NOT NULL,
  period text NOT NULL,
  type report_type NOT NULL DEFAULT 'full',
  type_label text NOT NULL,
  controls_data jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'generated',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Suivi paies
CREATE TABLE suivi_paie_mois (
  id text PRIMARY KEY,
  period text NOT NULL UNIQUE,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_suivi_mois BEFORE UPDATE ON suivi_paie_mois FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE suivi_paie_lines (
  id text PRIMARY KEY,
  mois_id text NOT NULL REFERENCES suivi_paie_mois(id) ON DELETE CASCADE,
  numero_dossier text NOT NULL,
  nom_dossier text NOT NULL,
  gp text NOT NULL DEFAULT '',
  date_reception text NOT NULL DEFAULT '',
  traitement_par text NOT NULL DEFAULT '',
  date_envoi_bulletins text NOT NULL DEFAULT '',
  nombre_bulletins integer NOT NULL DEFAULT 0,
  entrees integer NOT NULL DEFAULT 0,
  sorties integer NOT NULL DEFAULT 0,
  bulletins_refaits integer NOT NULL DEFAULT 0,
  fichier_virements boolean NOT NULL DEFAULT false,
  dsn text NOT NULL DEFAULT '',
  synced_from_silae boolean NOT NULL DEFAULT false,
  last_silae_sync timestamptz
);
CREATE INDEX idx_suivi_lines_mois ON suivi_paie_lines(mois_id);

-- Config (singleton)
CREATE TABLE app_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  cabinet text NOT NULL DEFAULT 'Bright Conseil',
  missive_box text NOT NULL DEFAULT 'inbox',
  missive_limit integer NOT NULL DEFAULT 25,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_check CHECK (id = 'singleton')
);
INSERT INTO app_config DEFAULT VALUES;
CREATE TRIGGER trg_config BEFORE UPDATE ON app_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Conversations Missive ignorees
CREATE TABLE dismissed_conversations (
  missive_id text PRIMARY KEY,
  dismissed_at timestamptz NOT NULL DEFAULT now()
);

-- Snapshots salaries pour calcul entrees/sorties
CREATE TABLE silae_salaries_snapshot (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_dossier text NOT NULL,
  period text NOT NULL,
  matricule text NOT NULL,
  nom_complet text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(numero_dossier, period, matricule)
);
CREATE INDEX idx_snapshot_dp ON silae_salaries_snapshot(numero_dossier, period);

-- Log de sync Silae
CREATE TABLE silae_sync_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  dossiers_synced integer DEFAULT 0,
  entrees_detected integer DEFAULT 0,
  sorties_detected integer DEFAULT 0,
  error_message text
);

-- Veille sociale (articles)
CREATE TABLE veille_articles (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  source text NOT NULL,
  source_url text NOT NULL DEFAULT '',
  published_at timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL DEFAULT 'autre',
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_veille_published ON veille_articles(published_at DESC);

-- RLS (acces equipe partage)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE suivi_paie_mois ENABLE ROW LEVEL SECURITY;
ALTER TABLE suivi_paie_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissed_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE silae_salaries_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE silae_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE veille_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_all" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON dossiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON controls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON control_checks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON suivi_paie_mois FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON suivi_paie_lines FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON app_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON dismissed_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON silae_salaries_snapshot FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON silae_sync_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "team_all" ON veille_articles FOR ALL USING (true) WITH CHECK (true);

-- Activer Realtime sur les tables principales
ALTER PUBLICATION supabase_realtime ADD TABLE tasks, members, dossiers, controls, control_checks, suivi_paie_mois, suivi_paie_lines, app_config;
