import { vi } from "vitest";
import { cookieJar, headerJar } from "./request-context";

process.env.QUIET_ACTION_WARNINGS = "1";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-123456";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
  headers: async () => headerJar,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;${url}` });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// Optional: use an engine-free Prisma client (driver adapter) generated for the test harness
// (PRISMA_TEST_CLIENT=<path to generated client>). Otherwise the app's own client is used.
vi.mock("@/lib/prisma", async (importOriginal) => {
  if (!process.env.PRISMA_TEST_CLIENT) return importOriginal();
  const { PrismaClient } = await import(process.env.PRISMA_TEST_CLIENT);
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const db = globalThis.__testDb || new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL }) });
  globalThis.__testDb = db;
  return { db };
});
