import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const SESSION_KEY = "atelier-june-supabase-session-v1";

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
    const message = data?.msg || data?.message || data?.error_description || data?.error || `Supabase request failed (${response.status}).`;
    throw new Error(message);
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
  const data = await request("/auth/v1/signup", {
    method: "POST",
    body: { email, password, data: { full_name: fullName } }
  });
  if (data.access_token) saveSession(data);
  return data;
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
  if (!rows?.[0]) throw new Error("Your profile is not ready yet. Sign out and back in, or check the profile trigger migration.");
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

export async function createCheckout(items) {
  const token = await currentToken();
  return request("/functions/v1/create-checkout", { method: "POST", token, body: { items } });
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
