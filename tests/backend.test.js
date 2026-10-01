import test from "node:test";
import assert from "node:assert/strict";
import {
  authCallbackReturnPath, completeAuthCallback, createCheckout, getShoppingState,
  saveShoppingState, startGoogleSignIn, supabaseErrorMessage
} from "../src/backend.js";

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

test("missing account shopping migration gives an actionable update path", () => {
  const message = supabaseErrorMessage({
    code: "PGRST205",
    message: "Could not find the table 'public.customer_cart' in the schema cache"
  }, 404);
  assert.match(message, /20261001000000_customer_shopping_and_order_email\.sql/);
  assert.match(message, /supabase db push/);
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

test("shopping-state sync uses authenticated owner-scoped tables through the atomic RPC", async () => {
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
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/customer_cart")) {
      return Response.json([{ product_id: "arc-bag", quantity: 2 }]);
    }
    if (String(url).includes("/customer_wishlist")) {
      return Response.json([{ product_id: "soft-chain" }]);
    }
    return new Response(null, { status: 204 });
  };

  try {
    assert.deepEqual(await getShoppingState(), {
      cart: [{ productId: "arc-bag", quantity: 2 }],
      wishlist: ["soft-chain"]
    });
    await saveShoppingState({
      cart: [{ productId: "daily-tote", quantity: 1 }],
      wishlist: ["wide-frame"]
    });
    const rpc = requests.find(({ url }) => url.includes("/rpc/replace_customer_shopping_state"));
    assert.ok(rpc);
    assert.equal(rpc.options.method, "POST");
    assert.equal(rpc.options.headers.Authorization, "Bearer test-token");
    assert.deepEqual(JSON.parse(rpc.options.body), {
      p_cart: [{ product_id: "daily-tote", quantity: 1 }],
      p_wishlist: [{ product_id: "wide-frame" }]
    });
    assert.ok(requests.some(({ url }) => url.includes("/customer_cart?")));
    assert.ok(requests.some(({ url }) => url.includes("/customer_wishlist?")));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test("auth callback exchanges the PKCE code and rejects external return paths", async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const values = new Map([
    ["atelier-june-pkce-verifier-v1", "stored-verifier"]
  ]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  globalThis.window = { location: { origin: "https://store.example" } };
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return String(url).includes("grant_type=pkce")
      ? Response.json({ access_token: "access-token", refresh_token: "refresh-token" })
      : Response.json({ id: "owner-id", email: "owner@example.test" });
  };

  try {
    const next = await completeAuthCallback("https://store.example/auth/callback?code=one-time-code&next=%2Fcheckout");
    assert.equal(next, "/checkout");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      auth_code: "one-time-code",
      code_verifier: "stored-verifier"
    });
    assert.equal(requests[1].options.headers.Authorization, "Bearer access-token");
    assert.equal(values.has("atelier-june-pkce-verifier-v1"), false);
    assert.equal(authCallbackReturnPath("https://store.example/auth/callback?next=%2F%2Fevil.example"), "/");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("Google sign-in uses a per-attempt PKCE challenge and same-origin callback", async () => {
  const originalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const values = new Map();
  let navigation = "";
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
  globalThis.window = { location: { origin: "https://store.example", assign: (value) => { navigation = value; } } };

  try {
    await startGoogleSignIn("/checkout");
    const authorize = new URL(navigation);
    const redirect = new URL(authorize.searchParams.get("redirect_to"));
    const verifier = values.get("atelier-june-pkce-verifier-v1");
    assert.equal(authorize.searchParams.get("provider"), "google");
    assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
    assert.equal(redirect.origin, "https://store.example");
    assert.equal(redirect.pathname, "/auth/callback");
    assert.equal(redirect.searchParams.get("next"), "/checkout");
    assert.equal(verifier.length, 43);
    assert.notEqual(authorize.searchParams.get("code_challenge"), verifier);
    assert.equal(authorize.searchParams.has("client_secret"), false);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
