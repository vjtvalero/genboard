// ─────────────────────────────────────────────────────────────────────────────
// Model cache. Discovery (network fetch + CLI spawn) is too costly to run on
// every page load, so results are cached in memory and mirrored to
// ~/.genboard/model-cache.json. Reads are served instantly from the cache;
// when the entry is older than the TTL it is served anyway and a refresh is
// kicked off in the background (stale-while-revalidate), so a reload never waits
// on discovery. The static CATALOG is the fallback for any provider with no
// cached models yet (or whose source failed).
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CATALOG, type ModelSpec, type ProviderName, type ProviderSpec } from "./catalog";
import { fetchRegistryModels, fetchCliModels } from "./model-registry";

const TTL_MS = Number(process.env.GENBOARD_MODEL_TTL_MS) || 12 * 60 * 60 * 1000;

interface CacheShape {
  fetchedAt: number;
  models: Partial<Record<ProviderName, ModelSpec[]>>;
}

function cachePath(): string {
  return path.join(os.homedir(), ".genboard", "model-cache.json");
}

let memo: CacheShape | null = null;
let loaded = false;
let refreshing: Promise<CacheShape> | null = null;

async function loadFromDisk(): Promise<CacheShape | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath(), "utf8")) as CacheShape;
    return parsed && typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  memo = await loadFromDisk();
  loaded = true;
}

async function doRefresh(): Promise<CacheShape> {
  const [registry, cli] = await Promise.all([
    fetchRegistryModels().catch(() => ({}) as Partial<Record<ProviderName, ModelSpec[]>>),
    fetchCliModels().catch(() => ({}) as Partial<Record<ProviderName, ModelSpec[]>>),
  ]);
  // Merge over whatever we had so a single failed source never drops a provider.
  const models = { ...(memo?.models ?? {}), ...registry, ...cli };
  const next: CacheShape = { fetchedAt: Date.now(), models };
  memo = next;
  loaded = true;
  try {
    await fs.mkdir(path.dirname(cachePath()), { recursive: true });
    await fs.writeFile(cachePath(), JSON.stringify(next, null, 2), "utf8");
  } catch {
    // A non-writable cache file is non-fatal; the in-memory copy still serves.
  }
  return next;
}

/** Force a discovery refresh now. Concurrent callers share one in-flight run. */
export function refreshModelCache(): Promise<CacheShape> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function mergeCatalog(models: Partial<Record<ProviderName, ModelSpec[]>>): ProviderSpec[] {
  return CATALOG.map((spec) => {
    const dynamic = models[spec.name];
    return dynamic && dynamic.length ? { ...spec, models: dynamic } : spec;
  });
}

/**
 * The catalog the UI should use: static provider metadata with each provider's
 * model list swapped for cached/discovered models when available. Never blocks
 * on discovery — a cold or stale cache serves immediately and revalidates in the
 * background.
 */
export async function getEffectiveCatalog(): Promise<ProviderSpec[]> {
  await ensureLoaded();
  if (!memo) {
    void refreshModelCache(); // cold cache: populate for the next load
    return CATALOG;
  }
  if (Date.now() - memo.fetchedAt > TTL_MS) {
    void refreshModelCache(); // stale-while-revalidate
  }
  return mergeCatalog(memo.models);
}

/** When the cache was last refreshed (ms epoch), or null if never. */
export async function getModelCacheFetchedAt(): Promise<number | null> {
  await ensureLoaded();
  return memo?.fetchedAt ?? null;
}
