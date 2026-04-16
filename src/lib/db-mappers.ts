// Conversion camelCase (TypeScript) <-> snake_case (Postgres)
// Couvre toutes les entites de l'app

import type {
  Task, Member, Dossier, Control, ControlCheck,
  Report, SuiviPaieMois, SuiviPaieLine, AppConfig,
} from "./types";

// --- Generic helpers ---

function toSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapKeys(obj: Record<string, any>, fn: (k: string) => string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) out[fn(k)] = obj[k];
  return out;
}

export function toDb<T extends Record<string, any>>(obj: T): Record<string, any> {
  return mapKeys(obj as Record<string, any>, toSnake);
}

export function fromDb<T>(row: Record<string, any>): T {
  return mapKeys(row, toCamel) as T;
}

export function fromDbRows<T>(rows: Record<string, any>[]): T[] {
  return rows.map((r) => fromDb<T>(r));
}

// --- Typed mappers for special cases ---

export function taskToDb(t: Partial<Task>): Record<string, any> {
  const row = toDb(t);
  // createdAt -> created_at is handled by toDb
  return row;
}

export function dossierToDb(d: Partial<Dossier>): Record<string, any> {
  return toDb(d);
}

export function controlToDb(c: Partial<Control>): Record<string, any> {
  const { checks, ...rest } = c as any;
  return toDb(rest);
}

export function controlCheckToDb(ch: ControlCheck, controlId: string, idx: number): Record<string, any> {
  return {
    control_id: controlId,
    idx,
    name: ch.name,
    status: ch.status,
    detail: ch.detail,
  };
}

export function reportToDb(r: Partial<Report>): Record<string, any> {
  const row = toDb(r);
  // controls -> controls_data (jsonb)
  if ("controls" in (r as any)) {
    row.controls_data = JSON.stringify((r as any).controls);
    delete row.controls;
  }
  return row;
}

export function suiviMoisToDb(m: Partial<SuiviPaieMois>): Record<string, any> {
  const { lines, ...rest } = m as any;
  return toDb(rest);
}

export function suiviLineToDb(l: Partial<SuiviPaieLine>, moisId: string): Record<string, any> {
  const row = toDb(l);
  row.mois_id = moisId;
  return row;
}

// --- Reconstruct complex objects from DB ---

export function controlFromDb(row: Record<string, any>, checks: Record<string, any>[]): Control {
  const base = fromDb<Omit<Control, "checks">>(row);
  return {
    ...base,
    checks: checks
      .sort((a, b) => a.idx - b.idx)
      .map((ch) => ({ name: ch.name, status: ch.status, detail: ch.detail })),
  } as Control;
}

export function reportFromDb(row: Record<string, any>): Report {
  const base = fromDb<Report>(row);
  // controls_data (jsonb) -> controls
  if ((base as any).controlsData) {
    (base as any).controls = (base as any).controlsData;
    delete (base as any).controlsData;
  }
  return base;
}

export function suiviMoisFromDb(
  row: Record<string, any>,
  lineRows: Record<string, any>[]
): SuiviPaieMois {
  const base = fromDb<Omit<SuiviPaieMois, "lines">>(row);
  return {
    ...base,
    lines: lineRows.map((l) => fromDb<SuiviPaieLine>(l)),
  } as SuiviPaieMois;
}
