import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.js";
import {
  paymentStatusFromTransaction, transactionMatchesOrder, validateTransaction, verifyWebhookSignature
} from "../_shared/payment.js";
import { findOrder, paystackVerify, requiredEnv, updatePayment } from "../_shared/supabase.js";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorResponse(new Error("Method not allowed."), 405);

  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature") || "";
    const validSignature = await verifyWebhookSignature(rawBody, signature, requiredEnv("PAYSTACK_SECRET_KEY"));
    if (!validSignature) return errorResponse(new Error("Invalid Paystack webhook signature."), 401);
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return errorResponse(new Error("Invalid webhook payload."), 400);
    }
    if (!["charge.success", "charge.failed"].includes(event?.event)) return jsonResponse({ received: true });
    const reference = event?.data?.reference;
    if (typeof reference !== "string" || !/^AJ-[\da-f-]{36}$/i.test(reference)) {
      return errorResponse(new Error("Invalid transaction reference."), 400);
    }
    const order = await findOrder(reference);
    if (!order) return errorResponse(new Error("Order reference not found."), 404);

    const transaction = await paystackVerify(reference);
    if (!transactionMatchesOrder(transaction, order)) {
      return errorResponse(new Error("Verified Paystack amount, currency, or reference does not match the order."), 409);
    }
    const status = paymentStatusFromTransaction(transaction);
    if (status === "pending") return jsonResponse({ received: true, payment_status: order.payment_status });
    if (status === "paid" && !validateTransaction(transaction, order)) {
      return errorResponse(new Error("Paystack has not confirmed successful payment."), 409);
    }
    const updated = await updatePayment(reference, status);
    return jsonResponse({ received: true, payment_status: updated?.payment_status || order.payment_status });
  } catch (error) {
    return errorResponse(error, 400);
  }
});
