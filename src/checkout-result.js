const PAYMENT_RESULT_STATES = {
  paid: {
    title: "Payment confirmed.",
    description: "Paystack verified this payment on the server. Your order is safely saved."
  },
  pending: {
    title: "Payment is still being verified.",
    description: "A redirect alone cannot confirm payment. Your order remains pending until Paystack verification succeeds.",
    action: `<button class="dialog-action" type="button" data-verify>Check payment again</button>`
  },
  failed: {
    title: "Payment failed.",
    description: "Paystack verified that this payment did not complete. Your bag is still saved so you can try again.",
    action: `<a class="button button-dark" href="/checkout">Try checkout again</a>`
  },
  cancelled: {
    title: "Checkout was cancelled.",
    description: "Your order remains unpaid and your bag is still saved. You can return to checkout whenever you’re ready.",
    action: `<a class="button button-dark" href="/checkout">Return to checkout</a>`
  }
};

export function paymentResultContent(status, emailStatus = "") {
  const result = PAYMENT_RESULT_STATES[status] || PAYMENT_RESULT_STATES.pending;
  const receiptQueued = status === "paid" && emailStatus === "pending";
  return `<p class="eyebrow">PAYSTACK CHECKOUT</p><h2>${result.title}</h2>
    <p class="dialog-intro">${result.description}</p>
    ${receiptQueued ? `<div class="checkout-notice">Your payment is confirmed, but its receipt is queued. Store admin: check the Mailgun function secrets/logs and scheduled retry worker.</div>` : ""}
    ${result.action || `<a class="button button-dark" href="/">Return to the collection</a>`}`;
}
