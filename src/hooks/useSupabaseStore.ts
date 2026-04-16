import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fromDbRows, fromDb, toDb } from "@/lib/db-mappers";
import type {
  Task, Member, Dossier, Control, ControlCheck,
  Report, AppConfig, SuiviPaieMois, SuiviPaieLine,
} from "@/lib/types";

// ── Shallow compare (avoids JSON.stringify cost) ───
function shallowEqual<T extends Record<string, any>>(a: T, b: T): boolean {
  if (a === b) return true;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// ── Generic hook with Realtime ─────────────────────

function useSupabaseTable<T extends { id: string }>(
  table: string,
  defaultValue: T[],
  orderBy = "created_at",
  ascending = false,
): [T[], (updater: T[] | ((prev: T[]) => T[])) => void] {
  const [data, setData] = useState<T[]>(defaultValue);

  // Initial fetch
  useEffect(() => {
    supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending })
      .then(({ data: rows }) => {
        if (rows) setData(fromDbRows<T>(rows));
      });
  }, [table, orderBy, ascending]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`rt_${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => {
          setData((prev) => {
            if (payload.eventType === "INSERT") {
              const row = fromDb<T>(payload.new);
              if (prev.some((r) => r.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = fromDb<T>(payload.new);
              return prev.map((r) => (r.id === row.id ? row : r));
            }
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as any).id;
              return prev.filter((r) => r.id !== oldId);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table]);

  // Setter: diffs and syncs to Supabase
  const set = useCallback(
    (updater: T[] | ((prev: T[]) => T[])) => {
      setData((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T[]) => T[])(prev) : updater;

        // Compute diff
        const prevMap = new Map(prev.map((r) => [r.id, r]));
        const nextMap = new Map(next.map((r) => [r.id, r]));

        const handleDbError = (op: string) => (result: { error: any }) => {
          if (result.error) {
            console.error(`[DB ${op}] ${table}:`, result.error.message);
            import("sonner").then(({ toast }) => {
              toast.error(`Erreur ${op} (${table}): ${result.error.message}`);
            });
          }
        };

        // Inserts
        for (const [id, row] of nextMap) {
          if (!prevMap.has(id)) {
            supabase.from(table).insert(toDb(row)).then(handleDbError("INSERT"));
          }
        }

        // Updates
        for (const [id, row] of nextMap) {
          const old = prevMap.get(id);
          if (old && !shallowEqual(old, row)) {
            supabase.from(table).update(toDb(row)).eq("id", id).then(handleDbError("UPDATE"));
          }
        }

        // Deletes
        for (const [id] of prevMap) {
          if (!nextMap.has(id)) {
            supabase.from(table).delete().eq("id", id).then(handleDbError("DELETE"));
          }
        }

        return next;
      });
    },
    [table]
  );

  return [data, set];
}

// ── Exported hooks (same signatures as before) ─────

export function useTasks() {
  return useSupabaseTable<Task>("tasks", []);
}

export function useMembers() {
  return useSupabaseTable<Member>("members", []);
}

export function useDossiers() {
  return useSupabaseTable<Dossier>("dossiers", [], "nom", true);
}

export function useControls() {
  return useSupabaseTable<Control>("controls", []);
}

export function useReports() {
  return useSupabaseTable<Report>("reports", []);
}

// ── Config (singleton row) ──────────────────────────

const DEFAULT_CONFIG: AppConfig = {
  cabinet: "Bright Conseil",
  missiveBox: "inbox",
  missiveLimit: 25,
};

export function useConfig(): [AppConfig, (updater: AppConfig | ((prev: AppConfig) => AppConfig)) => void] {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    supabase
      .from("app_config")
      .select("*")
      .eq("id", "singleton")
      .single()
      .then(({ data }) => {
        if (data) setConfig(fromDb<AppConfig>(data));
      });
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("rt_config")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_config" }, (payload) => {
        setConfig(fromDb<AppConfig>(payload.new));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const set = useCallback(
    (updater: AppConfig | ((prev: AppConfig) => AppConfig)) => {
      setConfig((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        supabase.from("app_config").update(toDb(next)).eq("id", "singleton").then(({ error }) => {
          if (error) {
            console.error("[DB UPDATE] app_config:", error.message);
            import("sonner").then(({ toast }) => {
              toast.error(`Erreur config: ${error.message}`);
            });
          }
        });
        return next;
      });
    },
    []
  );

  return [config, set];
}

// ── Dismissed conversations ─────────────────────────

export function useDismissed(): [string[], (updater: string[] | ((prev: string[]) => string[])) => void] {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("dismissed_conversations")
      .select("missive_id")
      .then(({ data }) => {
        if (data) setIds(data.map((r) => r.missive_id));
      });
  }, []);

  const set = useCallback(
    (updater: string[] | ((prev: string[]) => string[])) => {
      setIds((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const added = next.filter((id) => !prev.includes(id));
        if (added.length > 0) {
          supabase
            .from("dismissed_conversations")
            .insert(added.map((id) => ({ missive_id: id })))
            .then();
        }
        return next;
      });
    },
    []
  );

  return [ids, set];
}

// ── Suivi Paies (nested: mois + lines) ─────────────

export function useSuiviPaies(): [SuiviPaieMois[], (updater: SuiviPaieMois[] | ((prev: SuiviPaieMois[]) => SuiviPaieMois[])) => void] {
  const [mois, setMois] = useState<SuiviPaieMois[]>([]);

  // Fetch all mois with their lines
  const fetchAll = useCallback(async () => {
    const { data: moisRows } = await supabase
      .from("suivi_paie_mois")
      .select("*")
      .order("period", { ascending: false });

    if (!moisRows) return;

    const { data: lineRows } = await supabase
      .from("suivi_paie_lines")
      .select("*");

    const linesByMois = new Map<string, any[]>();
    for (const l of lineRows ?? []) {
      const arr = linesByMois.get(l.mois_id) ?? [];
      arr.push(l);
      linesByMois.set(l.mois_id, arr);
    }

    const result: SuiviPaieMois[] = moisRows.map((m) => ({
      id: m.id,
      period: m.period,
      lastSyncAt: m.last_sync_at ?? "",
      lines: (linesByMois.get(m.id) ?? []).map((l) => fromDb<SuiviPaieLine>(l)),
    }));

    setMois(result);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime: refetch on any change to lines or mois
  useEffect(() => {
    const ch1 = supabase
      .channel("rt_suivi_mois")
      .on("postgres_changes", { event: "*", schema: "public", table: "suivi_paie_mois" }, () => fetchAll())
      .subscribe();
    const ch2 = supabase
      .channel("rt_suivi_lines")
      .on("postgres_changes", { event: "*", schema: "public", table: "suivi_paie_lines" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchAll]);

  // Setter: sync only changed mois/lines to DB
  const set = useCallback(
    (updater: SuiviPaieMois[] | ((prev: SuiviPaieMois[]) => SuiviPaieMois[])) => {
      setMois((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;

        const prevMap = new Map(prev.map((m) => [m.id, m]));

        for (const m of next) {
          const old = prevMap.get(m.id);

          // Upsert mois row only if new or changed
          if (!old || old.period !== m.period || old.lastSyncAt !== m.lastSyncAt) {
            supabase.from("suivi_paie_mois").upsert({
              id: m.id,
              period: m.period,
              last_sync_at: m.lastSyncAt || null,
            }, { onConflict: "period" }).then(({ error }) => {
              if (error) console.error("[DB UPSERT] suivi_paie_mois:", error.message);
            });
          }

          // Build a map of old lines for diff
          const oldLineMap = new Map((old?.lines ?? []).map((l) => [l.id, l]));

          for (const l of m.lines) {
            const oldLine = oldLineMap.get(l.id);
            if (!oldLine || !shallowEqual(oldLine, l)) {
              supabase.from("suivi_paie_lines").upsert({
                ...toDb(l),
                mois_id: m.id,
              }, { onConflict: "id" }).then(({ error }) => {
                if (error) console.error("[DB UPSERT] suivi_paie_lines:", error.message);
              });
            }
          }
        }

        return next;
      });
    },
    []
  );

  return [mois, set];
}
