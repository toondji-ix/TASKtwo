import { emptyState, loadState, mergeShoppingStates, PRODUCTS, saveState, setCartQuantity, SHOPPING_OWNER_KEY } from "./store.js";
import {
  createCheckout, getCheckoutProducts, getProfile, getShoppingState, getUser, hasSession,
  saveShoppingState, signIn, signOut, signUp, startGoogleSignIn, updateProfile, verifyPayment
} from "./backend.js";

const $ = (selector) => document.querySelector(selector);
const money = (kobo) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(kobo / 100);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const content = $("#checkout-content");
const itemsNode = $("#checkout-items");
const totalNode = $("#checkout-total");
const notice = $("#checkout-notice");
let state = loadState(localStorage);
let profile = null;
let user = null;
let products = [];
let paymentReference = "";
const PAYMENT_REFERENCE_KEY = "atelier-june-pending-payment-reference";

function showError(error) {
  notice.textContent = error instanceof Error ? error.message : String(error);
  notice.classList.add("is-error");
}

function clearNotice() {
  notice.textContent = "";
  notice.classList.remove("is-error");
}

function persistShopping() {
  saveState(localStorage, state);
  if (hasSession()) return saveShoppingState(state).catch(showError);
  return Promise.resolve();
}

function displaySummary() {
  const byId = new Map(products.map((product) => [product.id, product]));
  const lines = state.cart.flatMap(({ productId, quantity }) => {
    const product = byId.get(productId);
    return product ? [{ product, quantity }] : [];
  });
  const subtotal = lines.reduce((sum, line) => sum + line.product.price_kobo * line.quantity, 0);
  const delivery = !lines.length || subtotal >= 10000000 ? 0 : 800000;
  itemsNode.innerHTML = lines.map(({ product, quantity }) => {
    const localProduct = PRODUCTS.find((item) => item.id === product.id);
    return `<article class="checkout-item">
      <img src="${escapeHtml(localProduct?.image || "")}" alt="${escapeHtml(localProduct?.alt || product.name)}">
      <div><strong>${escapeHtml(product.name)}</strong><span>${money(product.price_kobo)} each</span>
        <div class="checkout-stepper"><button type="button" data-quantity="${quantity - 1}" data-id="${escapeHtml(product.id)}" aria-label="Decrease ${escapeHtml(product.name)} quantity">−</button><span>${quantity}</span><button type="button" data-quantity="${quantity + 1}" data-id="${escapeHtml(product.id)}" aria-label="Increase ${escapeHtml(product.name)} quantity">+</button></div>
      </div><strong>${money(product.price_kobo * quantity)}</strong>
    </article>`;
  }).join("") || `<p class="empty-cart">Your bag is waiting to be filled.</p>`;
  totalNode.innerHTML = `<div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${delivery ? money(delivery) : "Complimentary"}</span></div>
    <div class="summary-row summary-total"><span>Estimated total</span><span>${money(subtotal + delivery)}</span></div>
    <p class="form-hint">Prices come from the Supabase catalog. Paystack checkout independently recalculates the final amount before payment.</p>`;
}

function renderEmptyCart() {
  content.innerHTML = `<p class="eyebrow">YOUR EVERYDAY EDIT</p><h2>Your bag is empty.</h2>
    <p class="dialog-intro">Find a piece you love and it will be waiting here when you’re ready.</p>
    <a class="button button-dark" href="/">Explore the collection <span aria-hidden="true">↗</span></a>`;
}

function renderSignedOut(message = "", mode = "signin") {
  const signup = mode === "signup";
  content.innerHTML = `<p class="eyebrow">YOUR ACCOUNT</p><h2>Sign in to continue.</h2>
    <p class="dialog-intro">Your bag will be saved to your account, and your order and delivery details stay private.</p>
    <form id="checkout-auth-form" data-mode="${signup ? "signup" : "signin"}"><div class="form-grid">
      ${signup ? `<div class="form-field full"><label for="checkout-auth-name">Full name *</label><input id="checkout-auth-name" name="name" autocomplete="name" minlength="2" required></div>` : ""}
      <div class="form-field full"><label for="checkout-email">Email address *</label><input id="checkout-email" name="email" type="email" autocomplete="email" required></div>
      <div class="form-field full"><label for="checkout-password">Password *</label><input id="checkout-password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required></div>
    </div><p class="form-error" id="checkout-auth-error">${escapeHtml(message)}</p><button class="dialog-action" type="submit">${signup ? "Create account" : "Sign in and continue"}</button></form>
    <button class="dialog-action google-action" type="button" data-google>Continue with Google</button>
    <button class="text-action" type="button" data-signup>${signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
    <p class="form-hint">Email confirmation links return to this secure checkout page.</p>`;
}

function renderSignedIn() {
  content.innerHTML = `<p class="eyebrow">DELIVERY DETAILS</p><h2>Your delivery.</h2>
    <p class="dialog-intro">These details are saved to your private Supabase profile. Payment takes place on Paystack.</p>
    <form id="checkout-form"><div class="form-grid">
      <div class="form-field full"><label for="checkout-name">Full name *</label><input id="checkout-name" name="full_name" autocomplete="name" maxlength="160" value="${escapeHtml(profile?.full_name)}" required></div>
      <div class="form-field full"><label for="checkout-email-signed">Email address</label><input id="checkout-email-signed" value="${escapeHtml(user?.email)}" disabled></div>
      <div class="form-field full"><label for="checkout-address">Street address *</label><input id="checkout-address" name="address" autocomplete="street-address" maxlength="300" value="${escapeHtml(profile?.address)}" required></div>
      <div class="form-field"><label for="checkout-city">City *</label><input id="checkout-city" name="city" autocomplete="address-level2" maxlength="120" value="${escapeHtml(profile?.city)}" required></div>
      <div class="form-field"><label for="checkout-postal">Postal code *</label><input id="checkout-postal" name="postal_code" autocomplete="postal-code" maxlength="40" value="${escapeHtml(profile?.postal_code)}" required></div>
      <div class="form-field full"><label for="checkout-country">Country / region *</label><input id="checkout-country" name="country" autocomplete="country-name" maxlength="120" value="${escapeHtml(profile?.country)}" required></div>
    </div><p class="form-error" id="checkout-error"></p>
    <button class="dialog-action" type="submit">Continue to secure payment</button></form>
    <p class="form-hint">Order confirmation is emailed only after Paystack verifies payment. Your card details never enter this storefront.</p>
    <button class="text-action" type="button" data-signout>Sign out</button>`;
}

function paymentResult(status, emailStatus = "") {
  const success = status === "paid";
  content.innerHTML = `<p class="eyebrow">PAYSTACK CHECKOUT</p><h2>${success ? "Payment confirmed." : "Payment is still being verified."}</h2>
    <p class="dialog-intro">${success
      ? "Paystack verified this payment on the server. Your order is safely saved."
      : "A redirect alone cannot confirm payment. Your order remains pending until Paystack verification succeeds."}</p>
    ${success && emailStatus !== "sent" ? `<div class="checkout-notice">Your payment is confirmed, but its receipt is queued. Store admin: check the Mailgun function secrets/logs and scheduled retry worker.</div>` : ""}
    ${!success ? `<button class="dialog-action" type="button" data-verify>Check payment again</button>` : ""}
    <a class="button button-dark" href="/">Return to the collection</a>`;
}

async function handlePaymentReturn() {
  const url = new URL(location.href);
  if (!url.searchParams.has("payment") && !sessionStorage.getItem(PAYMENT_REFERENCE_KEY)) return false;
  paymentReference = url.searchParams.get("reference") || url.searchParams.get("trxref") || sessionStorage.getItem(PAYMENT_REFERENCE_KEY) || "";
  if (paymentReference) sessionStorage.setItem(PAYMENT_REFERENCE_KEY, paymentReference);
  url.searchParams.delete("payment");
  url.searchParams.delete("reference");
  url.searchParams.delete("trxref");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  if (!paymentReference) {
    showError("No Paystack reference was returned. Sign in and check your orders before trying again.");
    return true;
  }
  if (!hasSession()) {
    content.innerHTML = `<p class="eyebrow">PAYSTACK CHECKOUT</p><h2>Sign in to verify.</h2><p class="dialog-intro">Sign in with the account used for checkout to check this payment securely.</p><button class="dialog-action" type="button" data-return-signin>Sign in</button>`;
    return true;
  }
  try {
    const result = await verifyPayment(paymentReference);
    if (result.payment_status === "paid") {
      state.cart = [];
      await persistShopping();
      sessionStorage.removeItem(PAYMENT_REFERENCE_KEY);
    }
    displaySummary();
    paymentResult(result.payment_status, result.confirmation_email_status);
  } catch (error) {
    paymentResult("pending");
    showError(error.message);
  }
  return true;
}

async function initialize() {
  const isReturn = await handlePaymentReturn();
  const local = state;
  if (isReturn && !hasSession()) {
    displaySummary();
    return;
  }
  if (hasSession()) {
    [user, profile] = await Promise.all([getUser(), getProfile()]);
    const [saved, catalog] = await Promise.all([
      getShoppingState(),
      getCheckoutProducts(state.cart.map((item) => item.productId))
    ]);
    const owner = localStorage.getItem(SHOPPING_OWNER_KEY);
    state = owner === user.id
      ? mergeShoppingStates(saved, emptyState())
      : owner ? mergeShoppingStates(saved, emptyState()) : mergeShoppingStates(saved, local);
    localStorage.setItem(SHOPPING_OWNER_KEY, user.id);
    if (owner !== user.id) await saveShoppingState(state);
    saveState(localStorage, state);
    products = catalog;
    displaySummary();
    if (!state.cart.length) {
      if (!isReturn) renderEmptyCart();
      return;
    }
    if (!isReturn) renderSignedIn();
  } else {
    products = await getCheckoutProducts(state.cart.map((item) => item.productId));
    displaySummary();
    if (!state.cart.length) renderEmptyCart();
    else if (!isReturn) renderSignedOut();
  }
}

document.addEventListener("click", async (event) => {
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    try {
      setCartQuantity(state, quantityButton.dataset.id, Number(quantityButton.dataset.quantity));
      persistShopping();
      products = await getCheckoutProducts(state.cart.map((item) => item.productId));
      displaySummary();
    } catch (error) {
      showError(error.message);
    }
  }
  if (event.target.closest("[data-google]")) {
    try {
      await startGoogleSignIn("/checkout");
    } catch (error) {
      showError(error.message);
    }
  }
  if (event.target.closest("[data-signup]")) renderSignedOut("", content.querySelector("#checkout-auth-form")?.dataset.mode === "signup" ? "signin" : "signup");
  if (event.target.closest("[data-return-signin]")) renderSignedOut();
  if (event.target.closest("[data-verify]") && paymentReference) {
    try {
      const result = await verifyPayment(paymentReference);
      if (result.payment_status === "paid") {
        state.cart = [];
        await persistShopping();
        sessionStorage.removeItem(PAYMENT_REFERENCE_KEY);
      }
      paymentResult(result.payment_status, result.confirmation_email_status);
    } catch (error) {
      showError(error.message);
    }
  }
  if (event.target.closest("[data-signout]")) {
    try {
      await signOut();
    } catch (error) {
      showError(`Signed out locally. ${error.message}`);
    }
    state = emptyState();
    saveState(localStorage, state);
    localStorage.removeItem(SHOPPING_OWNER_KEY);
    location.reload();
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "checkout-auth-form") {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      if (event.target.dataset.mode === "signup") {
        const result = await signUp(String(form.get("email")).trim(), String(form.get("password")), String(form.get("name")).trim());
        if (result.access_token) location.reload();
        else renderSignedOut("Check your email for a confirmation link, then return here to sign in.", "signin");
      } else {
        await signIn(String(form.get("email")).trim(), String(form.get("password")));
        location.reload();
      }
    } catch (error) {
      $("#checkout-auth-error").textContent = error.message;
    }
  }
  if (event.target.id === "checkout-form") {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Preparing secure checkout…";
    clearNotice();
    try {
      const details = Object.fromEntries(new FormData(event.target).entries());
      profile = await updateProfile({ ...profile, ...details });
      const result = await createCheckout(state.cart.map(({ productId, quantity }) => ({ productId, quantity })));
      if (!/^https:\/\/checkout\.paystack\.com\//i.test(result.authorization_url || "")) {
        throw new Error("Paystack returned an unexpected checkout URL. No redirect was made.");
      }
      location.assign(result.authorization_url);
    } catch (error) {
      $("#checkout-error").textContent = error.message;
      button.disabled = false;
      button.textContent = "Continue to secure payment";
    }
  }
});

initialize().catch((error) => {
  showError(error.message);
  if (!hasSession()) renderSignedOut();
  else content.innerHTML = `<p class="eyebrow">CHECKOUT SETUP</p><h2>We couldn’t load your checkout.</h2><p class="form-error">${escapeHtml(error.message)}</p><a class="button button-dark" href="/">Return to the store</a>`;
});
