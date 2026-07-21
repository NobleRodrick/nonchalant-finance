import { Inngest } from "inngest";

export const inngest = new Inngest({
  // NOTE: `id` is the Inngest *app* ID and prefixes every function ID
  // (e.g. nonchalant-finance-trigger-recurring-transactions). Renaming it
  // registers a brand new app and orphans the existing functions, so it is
  // deliberately left alone. Only the display name is rebranded.
  id: "nonchalant-finance", // Unique app ID
  name: "Springer Finance",
  retryFunction: async (attempt) => ({
    delay: Math.pow(2, attempt) * 1000, // Exponential backoff
    maxAttempts: 2,
  }),
});
