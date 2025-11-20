import arcjet, { tokenBucket, shield, detectBot } from "@arcjet/next";

// Server API route that initializes Arcjet in the Node/serverless environment.
// This keeps Arcjet out of the Edge middleware bundle. You can extend this
// endpoint to evaluate requests with Arcjet and return allow/block decisions.

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ["userId"],
  rules: [
    tokenBucket({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DISABLED",
      refillRate: 10,
      interval: 3600,
      capacity: 10,
    }),
    shield({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DISABLED",
    }),
    detectBot({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DISABLED",
      allow: ["CATEGORY:SEARCH_ENGINE", "GO_HTTP"],
    }),
  ],
});

export async function POST(req) {
  // Example: accept JSON payload describing request characteristics and
  // return a simple decision. Integrate with aj's API here if available.
  // For now this endpoint initializes Arcjet server-side so you can later
  // call Arcjet methods here without bundling Arcjet into middleware.

  try {
    const body = await req.json().catch(() => ({}));

    // TODO: use `aj` to evaluate `body` and decide allow/block based on rules.
    // The exact API to call on `aj` depends on the Arcjet SDK. If there's a
    // method like `aj.evaluate` or similar, call it here and return the result.

    return new Response(JSON.stringify({ ok: true, received: body }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
