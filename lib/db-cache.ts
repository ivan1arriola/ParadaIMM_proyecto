import "server-only";

import { prisma } from "./prisma";

function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && prisma);
}

export async function readDbCache<T>(key: string): Promise<T | null> {
  if (!isDbConfigured()) {
    return null;
  }

  try {
    const entry = await prisma!.apiCache.findUnique({ where: { key } });

    if (!entry) {
      return null;
    }

    if (entry.expiresAt.getTime() < Date.now()) {
      return null;
    }

    return entry.payload as T;
  } catch {
    return null;
  }
}

export async function readDbCacheStale<T>(key: string): Promise<T | null> {
  if (!isDbConfigured()) {
    return null;
  }

  try {
    const entry = await prisma!.apiCache.findUnique({ where: { key } });
    return entry ? (entry.payload as T) : null;
  } catch {
    return null;
  }
}

export async function writeDbCache<T>(key: string, payload: T, ttlMs: number): Promise<void> {
  if (!isDbConfigured()) {
    return;
  }

  try {
    await prisma!.apiCache.upsert({
      where: { key },
      create: {
        key,
        payload: payload as object,
        expiresAt: new Date(Date.now() + Math.max(60_000, ttlMs)),
      },
      update: {
        payload: payload as object,
        expiresAt: new Date(Date.now() + Math.max(60_000, ttlMs)),
      },
    });
  } catch {
    // Cache write errors should not break API usage.
  }
}
