export function requiredEnv(name) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret/configuration: ${name}`);
  return value;
}

export function projectUrl() {
  return requiredEnv("SUPABASE_URL").replace(/\/+$/, "");
}

export async function authenticate(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const url = projectUrl();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv("SUPABASE_ANON_KEY"),
      Authorization: authorization
    }
  });
  if (!response.ok) return null;
  return response.json();
}

export async function serviceRequest(path, { method = "GET", body, headers = {} } = {}) {
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${projectUrl()}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || result?.hint || `Supabase database request failed (${response.status}).`);
  return result;
}

export async function paystackVerify(reference) {
  const secret = requiredEnv("PAYSTACK_SECRET_KEY");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` }
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.status !== true || !result?.data) {
    throw new Error("Paystack could not verify this transaction.");
  }
  return result.data;
}

export async function updatePayment(reference, status) {
  const rows = await serviceRequest("/rest/v1/rpc/transition_order_payment", {
    method: "POST",
    body: { p_reference: reference, p_status: status }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function findOrder(reference) {
  const query = new URLSearchParams({
    select: "id,user_id,reference,currency,amount_kobo,payment_status",
    reference: `eq.${reference}`,
    limit: "1"
  });
  const rows = await serviceRequest(`/rest/v1/orders?${query}`);
  return rows?.[0] ?? null;
}
