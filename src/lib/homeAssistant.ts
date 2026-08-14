import type { HaEntityState } from "@/lib/citerneEau";

/** Server-only Home Assistant REST client. Never import from client components. */

export function getHomeAssistantConfig() {
  const baseUrl = process.env.HOME_ASSISTANT_URL?.replace(/\/$/, "");
  const token = process.env.HOME_ASSISTANT_TOKEN;
  if (!baseUrl || !token) {
    throw new Error("HOME_ASSISTANT_URL ou HOME_ASSISTANT_TOKEN manquant côté serveur.");
  }
  return { baseUrl, token };
}

export async function haFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { baseUrl, token } = getHomeAssistantConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Home Assistant ${response.status}: ${body.slice(0, 240)}`);
  }

  return response.json() as Promise<T>;
}

/** Fetches all HA states and returns only the requested entity ids, keyed by entity_id. */
export async function fetchHaStates(entityIds: readonly string[]): Promise<Record<string, HaEntityState>> {
  const states = await haFetch<HaEntityState[]>("/api/states");
  const wanted = new Set(entityIds);
  return states
    .filter((item) => wanted.has(item.entity_id))
    .reduce<Record<string, HaEntityState>>((acc, item) => {
      acc[item.entity_id] = item;
      return acc;
    }, {});
}
