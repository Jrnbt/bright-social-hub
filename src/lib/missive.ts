import { supabase } from "./supabase";
import type { AppConfig } from "./types";

interface MissiveConversation {
  id: string;
  subject?: string;
  latest_message?: { preview?: string };
}

export async function fetchMissiveConversations(
  config: AppConfig
): Promise<MissiveConversation[]> {
  const { data, error } = await supabase.functions.invoke("missive-proxy", {
    body: {
      action: "conversations",
      params: { box: config.missiveBox, limit: config.missiveLimit },
    },
  });

  if (error) throw new Error(`Erreur Missive: ${error.message}`);
  return (data?.conversations || []).slice(0, config.missiveLimit || 25);
}

export async function testMissiveConnection(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("missive-proxy", {
    body: { action: "test_connection" },
  });

  if (error) return false;
  return data?.ok === true;
}
