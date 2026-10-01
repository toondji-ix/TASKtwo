export function validateCart(items, products) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    throw new Error("Your bag must contain between 1 and 20 different products.");
  }
  const catalog = new Map(products.map((product) => [product.id, product]));
  const seen = new Set();
  const lines = items.map((item) => {
    if (!item || Object.keys(item).sort().join(",") !== "productId,quantity") {
      throw new Error("The cart contains an invalid product or quantity.");
    }
    const id = typeof item?.productId === "string" ? item.productId : "";
    const quantity = item?.quantity;
    if (!id || seen.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new Error("The cart contains an invalid product or quantity.");
    }
    seen.add(id);
    const product = catalog.get(id);
    if (!product || !Number.isSafeInteger(product.price_kobo) || product.price_kobo <= 0) {
      throw new Error("A product in your bag is unavailable.");
    }
    return { product, quantity, lineTotalKobo: product.price_kobo * quantity };
  });
  const subtotalKobo = lines.reduce((sum, line) => sum + line.lineTotalKobo, 0);
  const deliveryKobo = subtotalKobo >= 10000000 ? 0 : 800000;
  const amountKobo = subtotalKobo + deliveryKobo;
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) {
    throw new Error("The order total is invalid.");
  }
  return { lines, subtotalKobo, deliveryKobo, amountKobo };
}

export function validateTransaction(transaction, order) {
  if (!transaction || transaction.status !== "success") return false;
  return transactionMatchesOrder(transaction, order);
}

export function transactionMatchesOrder(transaction, order) {
  if (!transaction) return false;
  return transaction.reference === order.reference &&
    transaction.currency === "NGN" &&
    transaction.currency === order.currency &&
    Number.isSafeInteger(transaction.amount) &&
    transaction.amount === order.amount_kobo;
}

export function paymentStatusFromTransaction(transaction) {
  if (transaction?.status === "success") return "paid";
  if (transaction?.status === "failed") return "failed";
  if (transaction?.status === "abandoned") return "cancelled";
  return "pending";
}

export function paymentVerificationResponse(reference, order, updated, transaction) {
  return {
    reference,
    payment_status: updated?.payment_status || order.payment_status,
    transaction_status: transaction.status,
    confirmation_email_status: updated?.confirmation_email_status ?? null
  };
}

export function nextPaymentStatus(currentStatus, requestedStatus) {
  if (!["pending", "paid", "failed", "cancelled"].includes(currentStatus)) {
    throw new Error("Unknown current payment state.");
  }
  if (!["paid", "failed", "cancelled"].includes(requestedStatus)) {
    throw new Error("Unknown requested payment state.");
  }
  if (currentStatus === "paid") return "paid";
  if (requestedStatus === "paid") return "paid";
  return currentStatus === "pending" ? requestedStatus : currentStatus;
}

export async function verifyWebhookSignature(rawBody, signature, secret) {
  if (!/^[\da-f]{128}$/i.test(signature || "") || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) {
    difference |= digest[index] ^ Number.parseInt(signature.slice(index * 2, index * 2 + 2), 16);
  }
  return difference === 0;
}
