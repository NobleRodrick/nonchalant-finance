import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Arcjet: each test sets what the next decision is.
const state = { next: null, calls: [] };
const reason = (type, extra = {}) => ({ type, isRateLimit: () => type === "RATE_LIMIT", isEmail: () => type === "EMAIL", isBot: () => type === "BOT", ...extra });
const decision = (kind, r) => ({ isDenied: () => kind === "DENY", isErrored: () => kind === "ERROR", reason: r });
vi.mock("@arcjet/next", () => {
  const client = {
    withRule() { return client; },
    async protect(req, props) { state.calls.push(props); return state.next; },
  };
  const rule = (name) => (opts) => [{ name, opts }];
  return {
    default: () => client,
    shield: rule("shield"), detectBot: rule("bot"), slidingWindow: rule("window"), protectSignup: rule("signup"),
    request: async () => ({ headers: new Headers() }),
  };
});
const logs = [];
vi.mock("@/lib/observability", () => ({ logEvent: (level, payload) => logs.push({ level, ...payload }) }));
// The shared (database) counters, faked: one store for every "instance" (module reload).
const shared = { rows: new Map(), down: false };
vi.mock("@/lib/security/limiter", () => ({
  async hit(key, { windowMs }) {
    if (shared.down) throw new Error("database unreachable");
    const now = Date.now();
    const row = shared.rows.get(key);
    const next = !row || row.resetAt <= now ? { count: 1, resetAt: now + windowMs } : { ...row, count: row.count + 1 };
    shared.rows.set(key, next);
    return { count: next.count, resetAt: new Date(next.resetAt) };
  },
  async clear(key) {
    shared.rows.delete(key);
  },
}));

describe("abuse protection (guard)", () => {
  beforeEach(() => {
    vi.resetModules();
    state.calls.length = 0;
    logs.length = 0;
    shared.rows.clear();
    shared.down = false;
  });
  afterEach(() => {
    delete process.env.ARCJET_KEY;
    vi.unstubAllEnvs();
  });

  it("without ARCJET_KEY: counters shared by every instance block after the limit", async () => {
    const { guard, LIMITS } = await import("@/lib/security/protect");
    for (let i = 0; i < LIMITS.login.max - 1; i++) expect((await guard("login", { ip: "1.1.1.1", account: "a@x.cm" })).allowed).toBe(true);
    vi.resetModules(); // the last allowed attempt reaches another server instance: still counted
    const other = await import("@/lib/security/protect");
    expect((await other.guard("login", { ip: "1.1.1.1", account: "a@x.cm" })).allowed).toBe(true);
    const blocked = await other.guard("login", { ip: "1.1.1.1", account: "a@x.cm" });
    expect(blocked).toMatchObject({ allowed: false, source: "shared" });
    expect(blocked.message).toMatch(/Too many attempts. Try again in 15 minute/);
    expect((await other.guard("login", { ip: "1.1.1.1", account: "b@x.cm" })).allowed).toBe(true); // per account
    expect(state.calls).toHaveLength(0);
    // A successful sign-in forgets the attempts of that address + account.
    await other.forgive(blocked);
    expect((await other.guard("login", { ip: "1.1.1.1", account: "a@x.cm" })).allowed).toBe(true);
  });

  it("a production server without ARCJET_KEY says so loudly, once", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { guard } = await import("@/lib/security/protect");
    await guard("login", { ip: "4.4.4.4", account: "a@x.cm" });
    await guard("login", { ip: "4.4.4.4", account: "a@x.cm" });
    expect(logs.filter((l) => l.event === "arcjet_key_missing")).toEqual([expect.objectContaining({ level: "error" })]);
  });

  it("if the database cannot count, the memory limiter still applies (sign-in never breaks)", async () => {
    shared.down = true;
    const { guard } = await import("@/lib/security/protect");
    expect(await guard("password", { ip: "5.5.5.5", account: "u1" })).toMatchObject({ allowed: true, source: "memory" });
  });

  it("with ARCJET_KEY: Arcjet decides, with the account as a characteristic", async () => {
    process.env.ARCJET_KEY = "ajkey_test";
    const { guard } = await import("@/lib/security/protect");
    state.next = decision("ALLOW");
    expect(await guard("login", { ip: "2.2.2.2", account: "boss@x.cm" })).toEqual({ allowed: true, source: "arcjet" });
    expect(state.calls[0]).toEqual({ account: "boss@x.cm" });
    state.next = decision("DENY", reason("RATE_LIMIT", { reset: 125 }));
    expect(await guard("login", { account: "boss@x.cm" })).toMatchObject({ allowed: false, message: "Too many attempts. Try again in 3 minute(s)." });
    state.next = decision("DENY", reason("BOT"));
    expect((await guard("login", { account: "boss@x.cm" })).message).toMatch(/Automated requests/);
  });

  it("registration: Arcjet checks the e-mail address", async () => {
    process.env.ARCJET_KEY = "ajkey_test";
    const { guard } = await import("@/lib/security/protect");
    state.next = decision("DENY", reason("EMAIL"));
    const res = await guard("register", { email: "x@mailinator.com" });
    expect(state.calls[0]).toEqual({ email: "x@mailinator.com" });
    expect(res).toMatchObject({ allowed: false, message: "Enter a real e-mail address that can receive mail." });
  });

  it("if Arcjet errors, the shared counters take over (sign-in never breaks)", async () => {
    process.env.ARCJET_KEY = "ajkey_test";
    const { guard } = await import("@/lib/security/protect");
    state.next = decision("ERROR", { message: "timeout" });
    expect(await guard("password", { ip: "3.3.3.3", account: "u1" })).toMatchObject({ allowed: true, source: "shared" });
  });
});
