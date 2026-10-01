const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

export function orderConfirmationMessage(order, outboxId, domain) {
  if (order?.payment_status !== "paid" || !order.user_id || !order.email) {
    throw new Error("Only a confirmed paid order with its saved customer email can be sent.");
  }
  const formatMoney = (kobo) => `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const lines = (order.order_items || []).map((item) =>
    `${escapeHtml(item.product_name)} × ${Number(item.quantity)} — ${formatMoney(Number(item.unit_price_kobo) * Number(item.quantity))}`
  );
  const address = [order.delivery_address, order.delivery_city, order.delivery_postal_code, order.delivery_country]
    .map(escapeHtml).filter(Boolean).join(", ");
  const reference = escapeHtml(order.reference);
  return {
    to: order.email,
    subject: `Your Atelier June order ${order.reference} is confirmed`,
    text: [
      `Hello ${order.customer_name},`,
      `Your payment is confirmed for order ${order.reference}.`,
      ...lines,
      `Total: ${formatMoney(order.amount_kobo)}`,
      `Delivery address: ${address}`,
      "Thank you for choosing Atelier June."
    ].join("\n"),
    html: `<p>Hello ${escapeHtml(order.customer_name)},</p><p>Your payment is confirmed for order <strong>${reference}</strong>.</p><ul>${lines.map((item) => `<li>${item}</li>`).join("")}</ul><p>Total: <strong>${formatMoney(order.amount_kobo)}</strong></p><p>Delivery address: ${address}</p><p>Thank you for choosing Atelier June.</p>`,
    messageId: `<atelier-june-order-${outboxId}@${domain}>`
  };
}
