-- Migration 003 : Separation effectif / bulletins calcules
-- nombre_bulletins = effectif (salaries actifs)
-- bs_calcules = bulletins reellement traites

ALTER TABLE suivi_paie_lines
  RENAME COLUMN nombre_bulletins TO effectif;

ALTER TABLE suivi_paie_lines
  ADD COLUMN IF NOT EXISTS bs_calcules integer NOT NULL DEFAULT 0;

ALTER TABLE suivi_paie_lines
  ADD CONSTRAINT chk_bs_calcules_positive CHECK (bs_calcules >= 0);
