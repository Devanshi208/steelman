import { Redis } from "@upstash/redis";
import type { SearchResult } from "./types";

const hasUpstash =
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = hasUpstash ? Redis.fromEnv() : null;

/** Fallback so the app runs locally with no Redis configured. */
const memory = new Map<string, { value: unknown; expires: number }>();

function memGet<T>(key: string): T | null {
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    memory.delete(key);
    return null;
  }
  return hit.value as T;
}

function memSet(key: string, value: unknown, ttlSeconds: number) {
  memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  if (memory.size > 300) memory.delete(memory.keys().next().value as string);
}

/** Same question asked two ways should hit the same cache entry. */
export function claimKey(claim: string): string {
  const norm = claim
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\b(the|a|an|is|are|does|do|did|can|will|of|in|on|to|for)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

const TTL = 60 * 60 * 24 * 14; // two weeks

export async function getCached(id: string): Promise<SearchResult | null> {
  try {
    if (redis) return (await redis.get<SearchResult>(`claim:${id}`)) ?? null;
    return memGet<SearchResult>(`claim:${id}`);
  } catch {
    return null;
  }
}

export async function putCached(id: string, result: SearchResult): Promise<void> {
  try {
    if (redis) await redis.set(`claim:${id}`, result, { ex: TTL });
    else memSet(`claim:${id}`, result, TTL);
  } catch {
    /* cache failure must never break a search */
  }
}

/** Crude per-IP limiter. Uncached searches cost real money. */
export async function underLimit(ip: string, max = 12, windowSec = 3600): Promise<boolean> {
  const key = `rate:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  try {
    if (redis) {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec);
      return n <= max;
    }
    const n = (memGet<number>(key) ?? 0) + 1;
    memSet(key, n, windowSec);
    return n <= max;
  } catch {
    return true;
  }
}
