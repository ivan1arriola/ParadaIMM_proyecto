import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const prismaAdapter = databaseUrl ? new PrismaPg(databaseUrl) : null;

declare global {
  var __prismaClient__: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient | null {
  if (!prismaAdapter) {
    return null;
  }

  return new PrismaClient({
    adapter: prismaAdapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalThis.__prismaClient__ ?? createPrismaClient();

if (process.env.NODE_ENV !== "production" && prisma) {
  globalThis.__prismaClient__ = prisma;
}
