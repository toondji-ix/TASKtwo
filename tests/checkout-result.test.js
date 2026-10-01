import test from "node:test";
import assert from "node:assert/strict";
import { paymentResultContent } from "../src/checkout-result.js";

test("paid checkout result confirms payment without offering verification again", () => {
  const result = paymentResultContent("paid", "sent");
  assert.match(result, /Payment confirmed\./);
  assert.match(result, /Paystack verified this payment on the server/);
  assert.doesNotMatch(result, /data-verify/);
  assert.doesNotMatch(result, /receipt is queued/);
});

test("paid checkout result shows a queued receipt notice only for pending mail", () => {
  assert.match(paymentResultContent("paid", "pending"), /receipt is queued/);
  assert.doesNotMatch(paymentResultContent("paid", "sent"), /receipt is queued/);
  assert.doesNotMatch(paymentResultContent("paid"), /receipt is queued/);
});

test("pending checkout result offers another verification attempt", () => {
  const result = paymentResultContent("pending");
  assert.match(result, /Payment is still being verified\./);
  assert.match(result, /data-verify/);
  assert.match(result, /Check payment again/);
  assert.doesNotMatch(result, /receipt is queued/);
});

test("failed checkout result is definitive and offers a new checkout", () => {
  const result = paymentResultContent("failed");
  assert.match(result, /Payment failed\./);
  assert.match(result, /payment did not complete/);
  assert.match(result, /href="\/checkout">Try checkout again/);
  assert.doesNotMatch(result, /data-verify/);
});

test("cancelled checkout result is distinct and offers a return to checkout", () => {
  const result = paymentResultContent("cancelled");
  assert.match(result, /Checkout was cancelled\./);
  assert.match(result, /order remains unpaid/);
  assert.match(result, /href="\/checkout">Return to checkout/);
  assert.doesNotMatch(result, /data-verify/);
});
