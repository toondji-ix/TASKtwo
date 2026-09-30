import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.js";
import {
  paymentStatusFromTransaction, transactionMatchesOrder, validateTransaction
} from "../_shared/payment.js";
import { authenticate, findOrder, paystackVerify, updatePayment } from "../_shared/supabase.js";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorResponse(new Error("Method not allowed."), 405);
  try {
    const user = await authenticate(request);
    if (!user?.id) return errorResponse(new Error("Sign in to check your order."), 401);
    const body = await request.json().catch(() => null);
    const reference = body?.reference;
    if (Object.keys(body || {}).length !== 1 || typeof reference !== "string" || !/^AJ-[\da-f-]{36}$/i.test(reference)) {
      return errorResponse(new Error("A valid order reference is required."), 400);
    }
    const order = await findOrder(reference);
    if (!order || order.user_id !== user.id) return errorResponse(new Error("Order not found."), 404);
    const transaction = await paystackVerify(reference);
    if (!transactionMatchesOrder(transaction, order)) {
      return errorResponse(new Error("Paystack transaction details do not match this order. Its payment state was not changed."), 409);
    }
    const status = paymentStatusFromTransaction(transaction);
    if (status === "paid" && !validateTransaction(transaction, order)) {
      return errorResponse(new Error("Paystack has not confirmed payment for this order."), 409);
    }
    const updated = status === "pending" ? order : await updatePayment(reference, status);
    return jsonResponse({
      reference,
      payment_status: updated?.payment_status || order.payment_status,
      transaction_status: transaction.status
    });
  } catch (error) {
    const status = error?.message?.includes("Sign in") ? 401 : 400;
    return errorResponse(error, status);
  }
});
