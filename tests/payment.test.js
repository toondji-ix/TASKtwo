import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  nextPaymentStatus, paymentStatusFromTransaction, transactionMatchesOrder,
  validateCart, validateTransaction, verifyWebhookSignature
} from "../supabase/functions/_shared/payment.js";
import { orderConfirmationMessage } from "../supabase/functions/_shared/mailgun.js";

const products = [
  { id: "pouch", name: "Pouch", price_kobo: 11500000 },
  { id: "studs", name: "Studs", price_kobo: 6750000 }
];

test("checkout calculates authoritative amount and delivery in integer kobo", () => {
  const result = validateCart([{ productId: "pouch", quantity: 1 }], products);
  assert.equal(result.subtotalKobo, 11500000);
  assert.equal(result.deliveryKobo, 0);
  assert.equal(result.amountKobo, 11500000);
  const smallerOrder = validateCart([{ productId: "studs", quantity: 1 }], products);
  assert.equal(smallerOrder.deliveryKobo, 800000);
  assert.equal(smallerOrder.amountKobo, 7550000);
  assert.equal(validateCart([{ productId: "studs", quantity: 2 }], products).amountKobo, 13500000);
});

test("checkout rejects client prices, duplicate IDs, unknown items and invalid quantities", () => {
  assert.throws(() => validateCart([], products), /between 1 and 20/);
  assert.throws(() => validateCart([{ productId: "pouch", quantity: 1, price: 1 }], products), /invalid product or quantity/);
  assert.throws(() => validateCart([{ productId: "pouch", quantity: 1 }, { productId: "pouch", quantity: 1 }], products), /invalid product or quantity/);
  assert.throws(() => validateCart([{ productId: "missing", quantity: 1 }], products), /unavailable/);
  assert.throws(() => validateCart([{ productId: "pouch", quantity: 21 }], products), /invalid product or quantity/);
  assert.throws(() => validateCart([{ productId: "pouch", quantity: 1 }], [{ id: "pouch", price_kobo: 0 }]), /unavailable/);
});

test("successful payments must match the stored reference, exact amount, and NGN currency", () => {
  const order = { reference: "AJ-example", amount_kobo: 7550000, currency: "NGN" };
  const payment = { reference: "AJ-example", amount: 7550000, currency: "NGN", status: "success" };
  assert.equal(validateTransaction(payment, order), true);
  assert.equal(validateTransaction({ ...payment, amount: 7550001 }, order), false);
  assert.equal(validateTransaction({ ...payment, currency: "USD" }, order), false);
  assert.equal(validateTransaction({ ...payment, reference: "AJ-other" }, order), false);
  assert.equal(validateTransaction({ ...payment, status: "pending" }, order), false);
  assert.equal(transactionMatchesOrder({ ...payment, status: "failed" }, order), true);
});

test("payment state transitions are idempotent and cannot downgrade a paid order", () => {
  assert.equal(nextPaymentStatus("pending", "paid"), "paid");
  assert.equal(nextPaymentStatus("pending", "failed"), "failed");
  assert.equal(nextPaymentStatus("pending", "cancelled"), "cancelled");
  assert.equal(nextPaymentStatus("paid", "failed"), "paid");
  assert.equal(nextPaymentStatus("failed", "paid"), "paid");
  assert.equal(nextPaymentStatus("failed", "cancelled"), "failed");
  assert.equal(nextPaymentStatus("cancelled", "cancelled"), "cancelled");
  assert.throws(() => nextPaymentStatus("pending", "pending"), /Unknown requested/);
  assert.equal(paymentStatusFromTransaction({ status: "abandoned" }), "cancelled");
  assert.equal(paymentStatusFromTransaction({ status: "processing" }), "pending");
});

test("webhook validation authenticates the exact raw body with Paystack HMAC SHA-512", async () => {
  const secret = "test-secret-only";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "AJ-example" } });
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  assert.equal(await verifyWebhookSignature(body, signature, secret), true);
  assert.equal(await verifyWebhookSignature(`${body} `, signature, secret), false);
  assert.equal(await verifyWebhookSignature(body, "invalid", secret), false);
  assert.equal(await verifyWebhookSignature(body, signature, ""), false);
});

test("order receipt accepts only paid database orders and has stable owner-derived delivery data", () => {
  const order = {
    payment_status: "paid",
    user_id: "customer-uuid",
    email: "owner@example.test",
    customer_name: "<June>",
    reference: "AJ-reference",
    amount_kobo: 7550000,
    delivery_address: "12 Main St",
    delivery_city: "Lagos",
    delivery_postal_code: "100001",
    delivery_country: "Nigeria",
    order_items: [{ product_name: "<Bag>", quantity: 1, unit_price_kobo: 7550000 }]
  };
  const first = orderConfirmationMessage(order, "outbox-uuid", "mg.example.test");
  const retry = orderConfirmationMessage(order, "outbox-uuid", "mg.example.test");
  assert.equal(first.to, order.email);
  assert.equal(first.messageId, retry.messageId);
  assert.match(first.messageId, /outbox-uuid@mg\.example\.test/);
  assert.match(first.html, /&lt;June&gt;/);
  assert.match(first.html, /&lt;Bag&gt;/);
  assert.match(first.text, /AJ-reference/);
  assert.throws(() => orderConfirmationMessage({ ...order, payment_status: "pending" }, "outbox-uuid", "mg.example.test"), /confirmed paid order/);
  assert.throws(() => orderConfirmationMessage({ ...order, email: "" }, "outbox-uuid", "mg.example.test"), /saved customer email/);
});
