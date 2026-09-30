import { errorResponse, handleOptions, jsonResponse } from "../_shared/http.js";
import { validateCart } from "../_shared/payment.js";
import { authenticate, requiredEnv, serviceRequest } from "../_shared/supabase.js";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  if (request.method !== "POST") return errorResponse(new Error("Method not allowed."), 405);

  try {
    const paystackSecret = requiredEnv("PAYSTACK_SECRET_KEY");
    const siteUrl = requiredEnv("SITE_URL").replace(/\/+$/, "");
    const user = await authenticate(request);
    if (!user?.id || !user.email) return errorResponse(new Error("Sign in before checkout."), 401);
    let input;
    try {
      input = await request.json();
    } catch {
      return errorResponse(new Error("Send a valid cart."), 400);
    }
    if (!input || Object.keys(input).length !== 1 || !Array.isArray(input.items) ||
        input.items.some((item) => !item || Object.keys(item).length !== 2 ||
          !Object.hasOwn(item, "productId") || !Object.hasOwn(item, "quantity"))) {
      return errorResponse(new Error("Checkout accepts only product IDs and quantities."), 400);
    }

    const profiles = await serviceRequest(`/rest/v1/profiles?select=id,full_name,address,city,postal_code,country&id=eq.${encodeURIComponent(user.id)}&limit=1`);
    const profile = profiles?.[0];
    if (!profile || [profile.full_name, profile.address, profile.city, profile.postal_code, profile.country].some((value) => !String(value || "").trim())) {
      return errorResponse(new Error("Complete your name and delivery address in your account before checkout."), 400);
    }

    const products = await serviceRequest("/rest/v1/products?select=id,name,price_kobo,active&active=eq.true");
    const { lines, subtotalKobo, deliveryKobo, amountKobo } = validateCart(input.items, products || []);
    const reference = `AJ-${crypto.randomUUID()}`;
    const orderRows = await serviceRequest("/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        user_id: user.id,
        reference,
        email: user.email,
        customer_name: profile.full_name,
        delivery_address: profile.address,
        delivery_city: profile.city,
        delivery_postal_code: profile.postal_code,
        delivery_country: profile.country,
        currency: "NGN",
        subtotal_kobo: subtotalKobo,
        delivery_kobo: deliveryKobo,
        amount_kobo: amountKobo
      }
    });
    const order = orderRows?.[0];
    if (!order) throw new Error("Could not create the pending order.");

    await serviceRequest("/rest/v1/order_items", {
      method: "POST",
      body: lines.map(({ product, quantity, lineTotalKobo }) => ({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price_kobo: product.price_kobo,
        line_total_kobo: lineTotalKobo
      }))
    });

    const paystack = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: `${siteUrl}/?payment=return`,
        metadata: { order_id: order.id }
      })
    });
    const paystackResult = await paystack.json().catch(() => null);
    if (!paystack.ok || paystackResult?.status !== true || !paystackResult?.data?.authorization_url) {
      await serviceRequest("/rest/v1/rpc/transition_order_payment", {
        method: "POST",
        body: { p_reference: reference, p_status: "failed" }
      });
      throw new Error("Paystack could not start this test payment. Review the function secrets and try again.");
    }
    return jsonResponse({
      authorization_url: paystackResult.data.authorization_url,
      reference,
      amount_kobo: amountKobo,
      currency: "NGN"
    }, 201);
  } catch (error) {
    const status = error?.message?.includes("Sign in") ? 401 : 400;
    return errorResponse(error, status);
  }
});
