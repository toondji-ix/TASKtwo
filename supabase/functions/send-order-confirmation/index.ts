import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.js";
import { orderConfirmationMessage } from "../_shared/mailgun.js";
import { requiredEnv, serviceRequest } from "../_shared/supabase.js";

async function mark(outboxId: string, success: boolean, error = "") {
  await serviceRequest("/rest/v1/rpc/finish_order_confirmation", {
    method: "POST",
    body: { p_outbox_id: outboxId, p_success: success, p_error: error }
  });
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorResponse(new Error("Method not allowed."), 405);

  let claimedId = "";
  try {
    const expectedSecret = requiredEnv("ORDER_EMAIL_INTERNAL_SECRET");
    const suppliedSecret = request.headers.get("x-internal-secret") || "";
    if (suppliedSecret.length !== expectedSecret.length) return errorResponse(new Error("Not authorized."), 401);
    const encoder = new TextEncoder();
    const [expected, supplied] = await Promise.all([
      crypto.subtle.digest("SHA-256", encoder.encode(expectedSecret)),
      crypto.subtle.digest("SHA-256", encoder.encode(suppliedSecret))
    ]);
    const left = new Uint8Array(expected);
    const right = new Uint8Array(supplied);
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    if (difference !== 0) return errorResponse(new Error("Not authorized."), 401);

    const input = await request.json().catch(() => ({}));
    const orderId = input?.order_id ?? null;
    if (orderId !== null && (typeof orderId !== "string" || !/^[\da-f-]{36}$/i.test(orderId))) {
      return errorResponse(new Error("Invalid order identifier."), 400);
    }
    if (orderId) {
      const queued = await serviceRequest(`/rest/v1/order_confirmation_outbox?select=status&order_id=eq.${encodeURIComponent(orderId)}&limit=1`);
      if (queued?.[0]?.status === "sent") return jsonResponse({ status: "sent" });
      if (queued?.[0]?.status === "processing") return jsonResponse({ status: "pending" });
    }
    const claims = await serviceRequest("/rest/v1/rpc/claim_order_confirmation", {
      method: "POST",
      body: { p_order_id: orderId }
    });
    const claim = claims?.[0];
    if (!claim) return jsonResponse({ status: "pending", message: "No due order confirmation is queued." });
    claimedId = claim.id;

    const rows = await serviceRequest(`/rest/v1/orders?select=id,user_id,email,customer_name,delivery_address,delivery_city,delivery_postal_code,delivery_country,currency,amount_kobo,payment_status,order_items(product_name,quantity,unit_price_kobo)&id=eq.${encodeURIComponent(claim.order_id)}&limit=1`);
    const order = rows?.[0];
    if (!order || order.payment_status !== "paid" || !order.user_id || !order.email) {
      throw new Error("The confirmed order owner or paid order details are unavailable.");
    }

    const domain = requiredEnv("MAILGUN_DOMAIN");
    const receipt = orderConfirmationMessage(order, claim.id, domain);
    const apiKey = requiredEnv("MAILGUN_API_KEY");
    const from = requiredEnv("MAILGUN_FROM");
    const region = Deno.env.get("MAILGUN_API_BASE") || "https://api.mailgun.net";
    const origin = new URL(region);
    if (origin.protocol !== "https:" || !["api.mailgun.net", "api.eu.mailgun.net"].includes(origin.hostname)) {
      throw new Error("MAILGUN_API_BASE must be https://api.mailgun.net or https://api.eu.mailgun.net.");
    }
    const message = new FormData();
    message.set("from", from);
    message.set("to", receipt.to);
    message.set("subject", receipt.subject);
    message.set("text", receipt.text);
    message.set("html", receipt.html);
    message.set("h:Message-ID", receipt.messageId);
    const sent = await fetch(`${origin.origin}/v3/${encodeURIComponent(domain)}/messages`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`api:${apiKey}`)}` },
      body: message
    });
    if (!sent.ok) throw new Error(`Mailgun could not accept the order confirmation (HTTP ${sent.status}).`);
    await mark(claim.id, true);
    return jsonResponse({ status: "sent" });
  } catch (error) {
    if (claimedId) {
      try {
        await mark(claimedId, false, error instanceof Error ? error.message : "Mailgun send failed.");
      } catch (markError) {
        console.error("Could not release order confirmation for retry:", markError);
      }
    }
    console.error("Order confirmation is queued for retry:", error);
    return errorResponse(error, 503);
  }
});
