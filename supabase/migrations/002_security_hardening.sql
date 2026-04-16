-- Migration 002 : Securite renforcee
-- Remplace les RLS permissives par des roles

-- 1. Table des utilisateurs autorises (whitelist)
CREATE TABLE IF NOT EXISTS authorized_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'gestionnaire' CHECK (role IN ('admin', 'responsable', 'gestionnaire')),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE authorized_users ENABLE ROW LEVEL SECURITY;
-- Seuls les admins peuvent gerer les utilisateurs autorises
CREATE POLICY "admin_only" ON authorized_users
  FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM authorized_users WHERE role = 'admin')
  );

-- 2. Fonction helper : verifier si l'utilisateur est autorise
CREATE OR REPLACE FUNCTION is_authorized()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM authorized_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM authorized_users WHERE user_id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Remplacer TOUTES les policies permissives

-- members
DROP POLICY IF EXISTS "team_all" ON members;
CREATE POLICY "read_members" ON members FOR SELECT USING (is_authorized());
CREATE POLICY "write_members" ON members FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "update_members" ON members FOR UPDATE USING (is_admin());
CREATE POLICY "delete_members" ON members FOR DELETE USING (is_admin());

-- dossiers
DROP POLICY IF EXISTS "team_all" ON dossiers;
CREATE POLICY "read_dossiers" ON dossiers FOR SELECT USING (is_authorized());
CREATE POLICY "write_dossiers" ON dossiers FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_dossiers" ON dossiers FOR UPDATE USING (is_authorized());
CREATE POLICY "delete_dossiers" ON dossiers FOR DELETE USING (is_admin());

-- tasks
DROP POLICY IF EXISTS "team_all" ON tasks;
CREATE POLICY "read_tasks" ON tasks FOR SELECT USING (is_authorized());
CREATE POLICY "write_tasks" ON tasks FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_tasks" ON tasks FOR UPDATE USING (is_authorized());
CREATE POLICY "delete_tasks" ON tasks FOR DELETE USING (is_authorized());

-- controls
DROP POLICY IF EXISTS "team_all" ON controls;
CREATE POLICY "read_controls" ON controls FOR SELECT USING (is_authorized());
CREATE POLICY "write_controls" ON controls FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_controls" ON controls FOR UPDATE USING (is_authorized());
CREATE POLICY "delete_controls" ON controls FOR DELETE USING (is_admin());

-- control_checks
DROP POLICY IF EXISTS "team_all" ON control_checks;
CREATE POLICY "read_checks" ON control_checks FOR SELECT USING (is_authorized());
CREATE POLICY "write_checks" ON control_checks FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_checks" ON control_checks FOR UPDATE USING (is_authorized());
CREATE POLICY "delete_checks" ON control_checks FOR DELETE USING (is_admin());

-- reports
DROP POLICY IF EXISTS "team_all" ON reports;
CREATE POLICY "read_reports" ON reports FOR SELECT USING (is_authorized());
CREATE POLICY "write_reports" ON reports FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "delete_reports" ON reports FOR DELETE USING (is_admin());

-- suivi_paie_mois
DROP POLICY IF EXISTS "team_all" ON suivi_paie_mois;
CREATE POLICY "read_suivi_mois" ON suivi_paie_mois FOR SELECT USING (is_authorized());
CREATE POLICY "write_suivi_mois" ON suivi_paie_mois FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_suivi_mois" ON suivi_paie_mois FOR UPDATE USING (is_authorized());

-- suivi_paie_lines
DROP POLICY IF EXISTS "team_all" ON suivi_paie_lines;
CREATE POLICY "read_suivi_lines" ON suivi_paie_lines FOR SELECT USING (is_authorized());
CREATE POLICY "write_suivi_lines" ON suivi_paie_lines FOR INSERT WITH CHECK (is_authorized());
CREATE POLICY "update_suivi_lines" ON suivi_paie_lines FOR UPDATE USING (is_authorized());

-- app_config
DROP POLICY IF EXISTS "team_all" ON app_config;
CREATE POLICY "read_config" ON app_config FOR SELECT USING (is_authorized());
CREATE POLICY "update_config" ON app_config FOR UPDATE USING (is_admin());

-- dismissed_conversations
DROP POLICY IF EXISTS "team_all" ON dismissed_conversations;
CREATE POLICY "read_dismissed" ON dismissed_conversations FOR SELECT USING (is_authorized());
CREATE POLICY "write_dismissed" ON dismissed_conversations FOR INSERT WITH CHECK (is_authorized());

-- silae_salaries_snapshot (lecture seule pour les non-admin)
DROP POLICY IF EXISTS "team_all" ON silae_salaries_snapshot;
CREATE POLICY "read_snapshot" ON silae_salaries_snapshot FOR SELECT USING (is_authorized());
-- Les ecritures se font uniquement via service_role (Edge Functions)

-- silae_sync_log (lecture seule)
DROP POLICY IF EXISTS "team_all" ON silae_sync_log;
CREATE POLICY "read_sync_log" ON silae_sync_log FOR SELECT USING (is_authorized());

-- 4. Index de securite / audit
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON silae_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON silae_sync_log(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_authorized_users_role ON authorized_users(role);

-- 5. Contraintes de validation
ALTER TABLE dossiers ADD CONSTRAINT chk_siret_format
  CHECK (siret = '' OR siret ~ '^\d{14}$');

ALTER TABLE suivi_paie_mois ADD CONSTRAINT chk_period_format
  CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$');

ALTER TABLE suivi_paie_lines ADD CONSTRAINT chk_bulletins_positive
  CHECK (nombre_bulletins >= 0 AND entrees >= 0 AND sorties >= 0);
