import test from "node:test";
import assert from "node:assert/strict";
import { createCheckout, supabaseErrorMessage } from "../src/backend.js";

test("missing Supabase commerce schema gives migration setup guidance", () => {
  const message = supabaseErrorMessage({
    code: "PGRST205",
    message: "Could not find the table 'public.orders' in the schema cache"
  }, 404);

  assert.match(message, /commerce database is not installed/);
  assert.match(message, /supabase\/migrations\/20260930000000_commerce\.sql/);
  assert.match(message, /SQL Editor/);
});

test("other Supabase errors retain their server message", () => {
  assert.equal(
    supabaseErrorMessage({ message: "Invalid login credentials" }, 400),
    "Invalid login credentials"
  );
});

test("existing Auth users can be backfilled into profiles without overwriting profiles", async () => {
  const { readFile } = await import("node:fs/promises");
  const migration = await readFile(
    new URL("../supabase/migrations/20260930000001_backfill_customer_profiles.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /insert into public\.profiles\s*\(id,\s*full_name\)/i);
  assert.match(migration, /from auth\.users/i);
  assert.match(migration, /where not exists\s*\([\s\S]*profiles\.id = users\.id/i);
  assert.match(migration, /on conflict \(id\) do nothing/i);
  assert.doesNotMatch(migration, /update\s+public\.profiles/i);
});

test("missing checkout function gives deployment and secret setup guidance", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const sessionKey = "atelier-june-supabase-session-v1";
  globalThis.localStorage = {
    getItem(key) {
      return key === sessionKey ? JSON.stringify({ access_token: "test-token" }) : null;
    },
    setItem() {},
    removeItem() {}
  };
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "NOT_FOUND",
    message: "Requested function was not found"
  }), { status: 404, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(
      createCheckout([]),
      /secure checkout function is not deployed.*PAYSTACK_SECRET_KEY and SITE_URL/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test("checkout fetch failure explains secure function setup", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const sessionKey = "atelier-june-supabase-session-v1";
  globalThis.localStorage = {
    getItem(key) {
      return key === sessionKey ? JSON.stringify({ access_token: "test-token" }) : null;
    },
    setItem() {},
    removeItem() {}
  };
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await assert.rejects(
      createCheckout([]),
      /secure checkout service is unavailable.*create-checkout.*PAYSTACK_SECRET_KEY and SITE_URL/i
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
