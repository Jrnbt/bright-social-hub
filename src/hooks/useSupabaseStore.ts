import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fromDbRows, fromDb, toDb } from "@/lib/db-mappers";
import type {
  Task, Member, Dossier, Control, ControlCheck,
  Report, AppConfig, SuiviPaieMois, SuiviPaieLine,
} from "@/lib/types";

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

        // Inserts
        for (const [id, row] of nextMap) {
          if (!prevMap.has(id)) {
            supabase.from(table).insert(toDb(row)).then();
          }
        }

        // Updates
        for (const [id, row] of nextMap) {
          const old = prevMap.get(id);
          if (old && JSON.stringify(old) !== JSON.stringify(row)) {
            supabase.from(table).update(toDb(row)).eq("id", id).then();
          }
        }

        // Deletes
        for (const [id] of prevMap) {
          if (!nextMap.has(id)) {
            supabase.from(table).delete().eq("id", id).then();
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
        supabase.from("app_config").update(toDb(next)).eq("id", "singleton").then();
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

  // Setter: sync changes to DB
  const set = useCallback(
    (updater: SuiviPaieMois[] | ((prev: SuiviPaieMois[]) => SuiviPaieMois[])) => {
      setMois((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;

        // For each mois in next, upsert mois + lines
        for (const m of next) {
          supabase.from("suivi_paie_mois").upsert({
            id: m.id,
            period: m.period,
            last_sync_at: m.lastSyncAt || null,
          }, { onConflict: "period" }).then();

          for (const l of m.lines) {
            supabase.from("suivi_paie_lines").upsert({
              ...toDb(l),
              mois_id: m.id,
            }, { onConflict: "id" }).then();
          }
        }

        return next;
      });
    },
    []
  );

  return [mois, set];
}
