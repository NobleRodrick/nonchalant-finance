/**
 * Finance Copilot: the language model behind the agent, behind one small interface so the agent
 * loop does not depend on a vendor:
 *
 *   model.generate({ system, contents, tools }) → { content, calls: [{ name, args }], text, usage }
 *
 * `contents` is the conversation in Gemini's format (role user/model, parts). The model's reply
 * (`content`) is kept exactly as returned — including any thought signatures — because the next
 * request must send it back unchanged.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

export const DEFAULT_COPILOT_MODEL = "gemini-3.5-flash"; // 2.5 Flash was retired for new keys (Oct 2026)
const TIMEOUT_MS = 45000;

export function copilotConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Errors worth one more try: rate limit, overload, server error, timeout. */
export function retryable(error) {
  const status = error?.status ?? Number(/\[(\d{3}) /.exec(error?.message || "")?.[1]);
  return [429, 500, 502, 503, 504].includes(status) || error?.name === "AbortError" || /aborted|ECONNRESET|ETIMEDOUT/i.test(error?.message || "");
}

/** Runs `call`, trying again after 1 s, 3 s and 7 s when the service is busy (then gives up). */
export async function withRetry(call, { delays = [1000, 3000, 7000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (attempt >= delays.length || !retryable(error)) throw error;
      await sleep(delays[attempt]);
    }
  }
}

/** Gemini with function calling. */
export function geminiModel({ apiKey = process.env.GEMINI_API_KEY, model = process.env.COPILOT_MODEL || DEFAULT_COPILOT_MODEL } = {}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  const client = new GoogleGenerativeAI(apiKey);
  return {
    name: model,
    async generate({ system, contents, tools }) {
      const m = client.getGenerativeModel(
        {
          model,
          systemInstruction: system,
          tools: [{ functionDeclarations: tools }],
          toolConfig: { functionCallingConfig: { mode: "AUTO" } },
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        },
        { timeout: TIMEOUT_MS }
      );
      const res = await withRetry(() => m.generateContent({ contents }));
      const r = res.response;
      const candidate = r.candidates?.[0];
      const content = candidate?.content?.parts?.length ? { role: "model", parts: candidate.content.parts } : { role: "model", parts: [{ text: "" }] };
      return {
        content,
        calls: content.parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} })),
        text: content.parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim(),
        usage: { tokensIn: r.usageMetadata?.promptTokenCount ?? null, tokensOut: r.usageMetadata?.candidatesTokenCount ?? null },
        finishReason: candidate?.finishReason || null,
      };
    },
  };
}

/**
 * A model that follows a script (tests and demos without a network): each step is a function of
 * the conversation so far returning { calls } or { text }.
 */
export function scriptedModel(steps) {
  let i = 0;
  return {
    name: "scripted",
    seen: [],
    async generate({ contents, tools, system }) {
      this.seen.push({ contents: JSON.parse(JSON.stringify(contents)), tools, system });
      const step = steps[Math.min(i, steps.length - 1)];
      i += 1;
      const out = typeof step === "function" ? step(contents) : step;
      const parts = out.calls ? out.calls.map((c) => ({ functionCall: { name: c.name, args: c.args || {} } })) : [{ text: out.text || "" }];
      return { content: { role: "model", parts }, calls: out.calls || [], text: out.text || "", usage: { tokensIn: null, tokensOut: null }, finishReason: "STOP" };
    },
  };
}
