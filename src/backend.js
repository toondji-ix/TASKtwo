import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const SESSION_KEY = "atelier-june-supabase-session-v1";
const PKCE_VERIFIER_KEY = "atelier-june-pkce-verifier-v1";

export function supabaseErrorMessage(data, status) {
  const missingResource = data?.message || data?.details || "";
  if (data?.code === "PGRST205" && /customer_cart|customer_wishlist|order_confirmation_outbox/i.test(missingResource)) {
    return "The customer shopping/email migration is not installed. Apply supabase/migrations/20261001000000_customer_shopping_and_order_email.sql with `supabase db push`, reload the schema cache, then try again.";
  }
  if (["PGRST202", "PGRST205"].includes(data?.code) && /replace_customer_shopping_state/i.test(missingResource)) {
    return "The customer shopping migration is not installed. Apply supabase/migrations/20261001000000_customer_shopping_and_order_email.sql with `supabase db push`, then try again.";
  }
  if (data?.code === "PGRST205") {
    return "The Supabase commerce database is not installed. Apply supabase/migrations/20260930000000_commerce.sql to this project in the Supabase SQL Editor, then reload and try again.";
  }
  return data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${status}).`;
}

function configured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase is not configured. Add your project URL and publishable/anon key to src/config.js, then reload.");
  }
  return SUPABASE_URL.replace(/\/+$/, "");
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (session?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function request(path, { method = "GET", body, token, headers = {} } = {}) {
  const url = configured();
  const response = await fetch(`${url}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(supabaseErrorMessage(data, response.status));
  }
  return data;
}

async function currentToken() {
  const session = readSession();
  if (!session?.access_token) throw new Error("Please sign in to continue.");
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    if (!session.refresh_token) {
      saveSession(null);
      throw new Error("Your session expired. Please sign in again.");
    }
    try {
      const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: session.refresh_token }
      });
      saveSession(refreshed);
      return refreshed.access_token;
    } catch {
      saveSession(null);
      throw new Error("Your session expired. Please sign in again.");
    }
  }
  return session.access_token;
}

export async function signUp(email, password, fullName) {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  const next = window.location.pathname === "/checkout" ? "/checkout" : "/";
  const redirectTo = new URL(`/auth/callback?next=${encodeURIComponent(next)}`, window.location.origin).toString();
  try {
    const data = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256`, {
      method: "POST",
      body: { email, password, data: { full_name: fullName } }
    });
    if (data.access_token) {
      saveSession(data);
      localStorage.removeItem(PKCE_VERIFIER_KEY);
    }
    return data;
  } catch (error) {
    localStorage.removeItem(PKCE_VERIFIER_KEY);
    throw error;
  }
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const safeUrl = new URL(value, "https://atelier-june.invalid");
    return safeUrl.origin === "https://atelier-june.invalid"
      ? `${safeUrl.pathname}${safeUrl.search}${safeUrl.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export async function startGoogleSignIn(next = "/") {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  localStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  const redirect = new URL("/auth/callback", window.location.origin);
  redirect.searchParams.set("next", safeReturnPath(next));
  const authorize = new URL(`${configured()}/auth/v1/authorize`);
  authorize.searchParams.set("provider", "google");
  authorize.searchParams.set("redirect_to", redirect.toString());
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "s256");
  window.location.assign(authorize.toString());
}

export async function completeAuthCallback(callbackUrl) {
  const url = new URL(callbackUrl);
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError) throw new Error(`Sign-in could not be completed: ${providerError}`);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const fragmentError = fragment.get("error_description") || fragment.get("error");
  if (fragmentError) throw new Error(`Email confirmation could not be completed: ${fragmentError}`);
  const code = url.searchParams.get("code");
  const verifier = localStorage.getItem(PKCE_VERIFIER_KEY);
  try {
    let session;
    if (code) {
      if (!verifier) throw new Error("This sign-in started in another browser session. Return to the store and try again.");
      session = await request("/auth/v1/token?grant_type=pkce", {
        method: "POST",
        body: { auth_code: code, code_verifier: verifier }
      });
    } else if (fragment.get("access_token") && fragment.get("refresh_token")) {
      session = {
        access_token: fragment.get("access_token"),
        refresh_token: fragment.get("refresh_token"),
        token_type: fragment.get("token_type") || "bearer",
        expires_in: Number(fragment.get("expires_in")) || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (Number(fragment.get("expires_in")) || 3600)
      };
    } else {
      throw new Error("The authentication link has expired or is incomplete. Request a new sign-in link.");
    }
    if (!session?.access_token) throw new Error("Supabase did not return a signed-in session.");
    saveSession(session);
    await getUser();
    return safeReturnPath(url.searchParams.get("next"));
  } finally {
    localStorage.removeItem(PKCE_VERIFIER_KEY);
  }
}

export function authCallbackError(callbackUrl) {
  const url = new URL(callbackUrl);
  return url.searchParams.get("error_description") || url.searchParams.get("error") || "";
}

export function authCallbackReturnPath(callbackUrl) {
  return safeReturnPath(new URL(callbackUrl).searchParams.get("next"));
}

export async function signIn(email, password) {
  const data = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password }
  });
  saveSession(data);
  return data;
}

export async function signOut() {
  try {
    const token = await currentToken();
    await request("/auth/v1/logout", { method: "POST", token });
  } finally {
    saveSession(null);
  }
}

export async function getUser() {
  const token = await currentToken();
  return request("/auth/v1/user", { token });
}

export async function getProfile() {
  const token = await currentToken();
  const rows = await request("/rest/v1/profiles?select=id,full_name,address,city,postal_code,country", { token });
  if (!rows?.[0]) {
    throw new Error("Your customer profile is missing. Apply supabase/migrations/20260930000001_backfill_customer_profiles.sql in the Supabase SQL Editor, then sign out and back in. If it still fails, check the profile trigger and owner-scoped profile policy from the commerce migration.");
  }
  return rows[0];
}

export async function updateProfile(profile) {
  const token = await currentToken();
  const rows = await request("/rest/v1/profiles?id=eq." + encodeURIComponent(profile.id), {
    method: "PATCH",
    token,
    body: {
      full_name: profile.full_name,
      address: profile.address,
      city: profile.city,
      postal_code: profile.postal_code,
      country: profile.country
    },
    headers: { Prefer: "return=representation" }
  });
  if (!rows?.[0]) throw new Error("Profile could not be saved. Confirm the profiles migration and owner policy are installed.");
  return rows[0];
}

export async function getOrders() {
  const token = await currentToken();
  return request("/rest/v1/orders?select=id,reference,currency,amount_kobo,payment_status,created_at,order_items(product_name,quantity,unit_price_kobo)&order=created_at.desc", { token });
}

export async function getShoppingState() {
  const token = await currentToken();
  const [cartRows, wishlistRows] = await Promise.all([
    request("/rest/v1/customer_cart?select=product_id,quantity&order=product_id.asc", { token }),
    request("/rest/v1/customer_wishlist?select=product_id&order=product_id.asc", { token })
  ]);
  return {
    cart: (cartRows || []).map((row) => ({ productId: row.product_id, quantity: row.quantity })),
    wishlist: (wishlistRows || []).map((row) => row.product_id)
  };
}

export async function saveShoppingState(state) {
  const token = await currentToken();
  await request("/rest/v1/rpc/replace_customer_shopping_state", {
    method: "POST",
    token,
    body: {
      p_cart: state.cart.map(({ productId, quantity }) => ({ product_id: productId, quantity })),
      p_wishlist: state.wishlist.map((productId) => ({ product_id: productId }))
    }
  });
}

export async function getCheckoutProducts(productIds) {
  if (!productIds.length) return [];
  const token = hasSession() ? await currentToken() : undefined;
  const filter = `in.(${productIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`;
  return request(`/rest/v1/products?select=id,name,category,price_kobo,active&id=${encodeURIComponent(filter)}&active=eq.true`, { token });
}

export async function createCheckout(items) {
  const token = await currentToken();
  try {
    return await request("/functions/v1/create-checkout", { method: "POST", token, body: { items } });
  } catch (error) {
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      throw new Error("The secure checkout service is unavailable. Deploy the Supabase create-checkout function and configure its PAYSTACK_SECRET_KEY and SITE_URL secrets, then try again.");
    }
    if (error.message === "Requested function was not found") {
      throw new Error("The secure checkout function is not deployed to this Supabase project. Deploy supabase/functions/create-checkout, configure its PAYSTACK_SECRET_KEY and SITE_URL secrets, then try again.");
    }
    throw error;
  }
}

export async function verifyPayment(reference) {
  const token = await currentToken();
  return request("/functions/v1/verify-payment", { method: "POST", token, body: { reference } });
}

export async function getOrderByReference(reference) {
  const token = await currentToken();
  const rows = await request(`/rest/v1/orders?select=id,reference,currency,amount_kobo,payment_status,created_at,order_items(product_name,quantity,unit_price_kobo)&reference=eq.${encodeURIComponent(reference)}`, { token });
  return rows?.[0] ?? null;
}

export function hasSession() {
  return Boolean(readSession()?.access_token);
}
