import {
  LEGACY_STORAGE_KEY, PRODUCTS, SHOPPING_OWNER_KEY, addToCart, cartCount, cartTotalKobo,
  emptyState, loadState, mergeShoppingStates, saveState, setCartQuantity, toggleWishlist
} from "./store.js";
import {
  createCheckout, getOrderByReference, getOrders, getProfile, getShoppingState, getUser,
  hasSession, saveShoppingState, signIn, signOut, signUp, startGoogleSignIn, updateProfile,
  verifyPayment
} from "./backend.js";
import { subscribeToCustomerCart } from "./realtime.js";

const $ = (selector, root = document) => root.querySelector(selector);
const money = (kobo) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kobo / 100);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const overlay = $("#overlay");
const dialog = $("#dialog");
const content = $("#dialog-content");
const toast = $("#toast");
let state = loadState(window.localStorage);
let selectedCategory = "All";
let wishlistOnly = false;
let toastTimer;
let accountUser = null;
let accountProfile = null;
let accountOrders = [];
let shoppingSaveQueue = Promise.resolve();
let cartRealtimeCleanup = null;
let cartRefreshTimer;

function stopCustomerCartSubscription() {
  clearTimeout(cartRefreshTimer);
  cartRealtimeCleanup?.();
  cartRealtimeCleanup = null;
}

function startCustomerCartSubscription(userId) {
  stopCustomerCartSubscription();
  subscribeToCustomerCart(userId, () => {
    clearTimeout(cartRefreshTimer);
    cartRefreshTimer = setTimeout(async () => {
      if (accountUser?.id !== userId) return;
      try {
        const saved = await getShoppingState();
        if (accountUser?.id !== userId) return;
        state = { ...state, cart: saved.cart };
        saveState(window.localStorage, state);
        renderBadges();
        renderProducts();
        if (overlay.dataset.dialog === "cart") openCart();
      } catch (error) {
        showToast(`Your bag could not be refreshed from your account. ${error.message}`);
      }
    }, 80);
  }, (error) => {
    showToast(`Live bag sync disconnected. ${error.message}`);
  })
    .then((cleanup) => {
      if (accountUser?.id === userId) cartRealtimeCleanup = cleanup;
      else cleanup();
    })
    .catch((error) => {
      showToast(`Live bag sync could not start. ${error.message}`);
    });
}

try {
  saveState(window.localStorage, state);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
} catch {}

function persist() {
  saveState(window.localStorage, state);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  renderBadges();
  if (hasSession()) {
    const snapshot = structuredClone(state);
    if (accountUser?.id) window.localStorage.setItem(SHOPPING_OWNER_KEY, accountUser.id);
    shoppingSaveQueue = shoppingSaveQueue.then(() => saveShoppingState(snapshot)).catch((error) => {
      showToast(`Your bag is saved on this device, but could not sync to your account. ${error.message}`);
    });
  }
}

async function hydrateCustomerShoppingState() {
  await shoppingSaveQueue;
  const [user, saved] = await Promise.all([getUser(), getShoppingState()]);
  accountUser = user;
  const owner = window.localStorage.getItem(SHOPPING_OWNER_KEY);
  state = owner && owner !== user.id
    ? mergeShoppingStates(saved, emptyState())
    : owner === user.id ? mergeShoppingStates(saved, emptyState()) : mergeShoppingStates(saved, state);
  saveState(window.localStorage, state);
  window.localStorage.setItem(SHOPPING_OWNER_KEY, user.id);
  if (owner !== user.id) await saveShoppingState(state);
  startCustomerCartSubscription(user.id);
  renderBadges();
  renderProducts();
}

function renderBadges() {
  $("#cart-count").textContent = cartCount(state);
  $("#wishlist-count").textContent = state.wishlist.length;
}

function productCard(product) {
  const saved = state.wishlist.includes(product.id);
  return `<article class="product-card">
    <div class="product-photo">
      ${product.label ? `<span class="product-label">${product.label}</span>` : ""}
      <img src="${product.image}" alt="${product.alt}" loading="lazy">
      <button class="favorite-button${saved ? " active" : ""}" data-action="favorite" data-id="${product.id}" aria-label="${saved ? "Remove from" : "Add to"} wishlist" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
      <button class="product-quick-add" data-action="add" data-id="${product.id}"><span>＋</span> Add to bag</button>
    </div>
    <div class="product-info">
      <div class="product-name-row"><span class="product-name">${product.name}</span><span class="product-price">${money(product.priceKobo)}</span></div>
      <p class="product-color">${product.color}</p>
    </div>
  </article>`;
}

function renderProducts() {
  const term = $("#product-search").value.trim().toLowerCase();
  const products = PRODUCTS.filter((product) =>
    (!wishlistOnly || state.wishlist.includes(product.id)) &&
    (selectedCategory === "All" || product.category === selectedCategory) &&
    (!term || `${product.name} ${product.category} ${product.color}`.toLowerCase().includes(term))
  );
  $("#product-grid").innerHTML = products.map(productCard).join("");
  $("#empty-products").hidden = products.length > 0;
  $("#collection-title").textContent = wishlistOnly ? "Your saved things." : selectedCategory === "All" ? "A few good things." : `A few good ${selectedCategory.toLowerCase()}.`;
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("active", !wishlistOnly && chip.dataset.category === selectedCategory));
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function openDialog(markup) {
  delete overlay.dataset.dialog;
  content.innerHTML = markup;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  dialog.focus();
}

function closeDialog() {
  overlay.hidden = true;
  document.body.style.overflow = "";
}

function deliveryFee(subtotalKobo) {
  return subtotalKobo >= 10000000 ? 0 : 800000;
}

function cartMarkup() {
  const subtotal = cartTotalKobo(state);
  if (!state.cart.length) return `<p class="eyebrow">YOUR EVERYDAY EDIT</p><h2 id="dialog-title">Your bag.</h2><div class="empty-cart">A little room for something lovely.<p>Your bag is waiting to be filled.</p></div><button class="dialog-action" data-action="continue">Explore the collection</button>`;
  const rows = state.cart.map(({ productId, quantity }) => {
    const product = PRODUCTS.find((entry) => entry.id === productId);
    if (!product) return "";
    return `<article class="cart-item">
      <img src="${product.image}" alt="${product.alt}">
      <div><p class="cart-item-name">${product.name}</p><p class="cart-item-meta">${product.color}</p>
        <div class="stepper"><button data-action="quantity" data-id="${product.id}" data-quantity="${quantity - 1}" aria-label="Decrease ${product.name} quantity">−</button><span>${quantity}</span><button data-action="quantity" data-id="${product.id}" data-quantity="${quantity + 1}" aria-label="Increase ${product.name} quantity">＋</button></div>
        <button class="remove-item" data-action="remove" data-id="${product.id}">Remove</button>
      </div><span class="cart-item-price">${money(product.priceKobo * quantity)}</span>
    </article>`;
  }).join("");
  const shipping = deliveryFee(subtotal);
  return `<p class="eyebrow">YOUR EVERYDAY EDIT · ${cartCount(state)} ${cartCount(state) === 1 ? "PIECE" : "PIECES"}</p><h2 id="dialog-title">Your bag.</h2>
    <div class="cart-list">${rows}</div>
    <p class="shipping-note">${shipping ? `Add ${money(10000000 - subtotal)} for complimentary delivery.` : "Complimentary delivery on this order."}</p>
    <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Complimentary"}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>${money(subtotal + shipping)}</span></div>
    <button class="dialog-action" data-action="checkout">Continue to checkout</button>
    <p class="form-hint">Payment is securely completed through Paystack. Your final total is calculated on the server.</p>`;
}

function openCart() {
  openDialog(cartMarkup());
  overlay.dataset.dialog = "cart";
}

function accountMarkup(message = "", mode = "signup") {
  if (!hasSession()) {
    const signup = mode === "signup";
    return `<p class="eyebrow">A PLACE OF YOUR OWN</p><h2 id="dialog-title">Your account.</h2>
      <p class="dialog-intro">Sign in securely to save your profile and see your orders. Account access is powered by Supabase.</p>
      <form id="account-form" data-mode="${signup ? "signup" : "signin"}"><div class="form-grid">
        ${signup ? `<div class="form-field full"><label for="account-name">Your name *</label><input id="account-name" name="name" autocomplete="name" required minlength="2"></div>` : ""}
        <div class="form-field full"><label for="account-email">Email address *</label><input id="account-email" name="email" type="email" autocomplete="email" required></div>
        <div class="form-field full"><label for="account-password">Password *</label><input id="account-password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required></div>
      </div><p class="form-error" id="account-error">${escapeHtml(message)}</p>
      <button class="dialog-action" type="submit">${signup ? "Create account" : "Sign in"}</button>
      </form><button class="dialog-action google-action" data-action="google-signin" type="button">Continue with Google</button><button class="text-action" data-action="auth-mode" data-mode="${signup ? "signin" : "signup"}">${signup ? "I already have an account" : "Create a new account"}</button>
      <p class="form-hint">Use the same email and password that you registered with. If email confirmation is enabled, confirm the link before signing in.</p>`;
  }
  const name = accountProfile?.full_name || accountUser?.email || "there";
  const orders = accountOrders.length ? `<div class="order-list">${accountOrders.map((order) => `<div class="order-entry"><div><strong>${escapeHtml(order.reference)}</strong><p>${new Date(order.created_at).toLocaleDateString()} · ${money(order.amount_kobo)} · ${paymentLabel(order.payment_status)}</p></div><button class="mini-button" data-action="track-order" data-id="${escapeHtml(order.reference)}">View order</button></div>`).join("")}</div>` : `<p class="form-hint">Your orders will appear here after checkout.</p>`;
  return `<p class="eyebrow">YOUR LITTLE CORNER</p><h2 id="dialog-title">Hello, ${escapeHtml(name.split(" ")[0])}.</h2>
    <div class="account-card"><strong>${escapeHtml(accountUser?.email || "")}</strong><p>Signed in with Supabase Auth</p></div>
    <h3 class="eyebrow">DELIVERY DETAILS</h3>
    <form id="profile-form"><div class="form-grid">
      <div class="form-field full"><label for="profile-name">Full name *</label><input id="profile-name" name="full_name" value="${escapeHtml(accountProfile?.full_name || "")}" autocomplete="name" required></div>
      <div class="form-field full"><label for="profile-address">Street address *</label><input id="profile-address" name="address" value="${escapeHtml(accountProfile?.address || "")}" autocomplete="street-address" required></div>
      <div class="form-field"><label for="profile-city">City *</label><input id="profile-city" name="city" value="${escapeHtml(accountProfile?.city || "")}" autocomplete="address-level2" required></div>
      <div class="form-field"><label for="profile-postal">Postal code *</label><input id="profile-postal" name="postal_code" value="${escapeHtml(accountProfile?.postal_code || "")}" autocomplete="postal-code" required></div>
      <div class="form-field full"><label for="profile-country">Country / region *</label><input id="profile-country" name="country" value="${escapeHtml(accountProfile?.country || "")}" autocomplete="country-name" required></div>
    </div><p class="form-error" id="profile-error">${escapeHtml(message)}</p><button class="dialog-action" type="submit">Save delivery details</button></form>
    <h3 class="eyebrow">YOUR ORDERS</h3>${orders}
    <button class="text-action" data-action="signout">Sign out</button>`;
}

async function openAccount(message = "", mode = "signup") {
  if (!hasSession()) return openDialog(accountMarkup(message, mode));
  openDialog(`<p class="eyebrow">YOUR LITTLE CORNER</p><h2 id="dialog-title">Loading your account…</h2><p class="form-hint">Connecting securely to your account and orders.</p>`);
  try {
    [accountUser, accountProfile, accountOrders] = await Promise.all([getUser(), getProfile(), getOrders()]);
    openDialog(accountMarkup(message));
  } catch (error) {
    if (!hasSession()) return openDialog(accountMarkup(error.message, "signin"));
    openDialog(`<p class="eyebrow">ACCOUNT CONNECTION</p><h2 id="dialog-title">Couldn’t load your account.</h2><p class="form-error">${escapeHtml(error.message)}</p><button class="dialog-action" data-action="account-retry">Try again</button>`);
  }
}

function checkoutMarkup() {
  const subtotal = cartTotalKobo(state);
  const shipping = deliveryFee(subtotal);
  return `<p class="eyebrow">A FEW DETAILS AND YOU’RE DONE</p><h2 id="dialog-title">Your delivery.</h2>
    <p class="dialog-intro">We’ll save your delivery details to your Supabase profile. Prices are in Nigerian naira (NGN); payment is confirmed by Paystack.</p>
    <form id="checkout-form"><div class="form-grid">
      <div class="form-field full"><label for="checkout-name">Full name *</label><input id="checkout-name" name="full_name" autocomplete="name" value="${escapeHtml(accountProfile?.full_name || "")}" required></div>
      <div class="form-field full"><label>Email address</label><input value="${escapeHtml(accountUser?.email || "")}" disabled></div>
      <div class="form-field full"><label for="checkout-address">Street address *</label><input id="checkout-address" name="address" autocomplete="street-address" value="${escapeHtml(accountProfile?.address || "")}" required></div>
      <div class="form-field"><label for="checkout-city">City *</label><input id="checkout-city" name="city" autocomplete="address-level2" value="${escapeHtml(accountProfile?.city || "")}" required></div>
      <div class="form-field"><label for="checkout-postal">Postal code *</label><input id="checkout-postal" name="postal_code" autocomplete="postal-code" value="${escapeHtml(accountProfile?.postal_code || "")}" required></div>
      <div class="form-field full"><label for="checkout-country">Country / region *</label><input id="checkout-country" name="country" autocomplete="country-name" value="${escapeHtml(accountProfile?.country || "")}" required></div>
    </div><p class="form-error" id="checkout-error"></p>
    <div class="summary-row" style="margin-top:18px"><span>Items</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Complimentary"}</span></div>
    <div class="summary-row summary-total"><span>Estimated total</span><span>${money(subtotal + shipping)}</span></div>
    <button class="dialog-action" type="submit">Continue to secure payment</button>
    </form><p class="form-hint">The payment total is recomputed from the server catalog. No card details enter this storefront.</p>`;
}

async function openCheckout() {
  window.location.assign("/checkout");
}

function paymentLabel(status) {
  return ({
    pending: "Payment pending",
    paid: "Payment confirmed",
    failed: "Payment failed",
    cancelled: "Payment cancelled"
  })[status] || "Payment pending";
}

function trackingResultMarkup(order) {
  const items = (order.order_items || []).map((item) =>
    `${escapeHtml(item.product_name)} × ${item.quantity}`
  ).join(" · ");
  return `<div class="tracking-card"><h3>${paymentLabel(order.payment_status)}</h3><p>Order ${escapeHtml(order.reference)} · placed ${new Date(order.created_at).toLocaleDateString()} · ${money(order.amount_kobo)} total</p>
    <div class="progress-track" aria-label="Payment status"><div class="progress-step complete">Order created</div><div class="progress-step${order.payment_status === "paid" ? " complete" : ""}">${paymentLabel(order.payment_status)}</div></div>
    <p class="order-items">${items}<br>Payment is confirmed only after server-side Paystack verification. Shipping is not connected.</p>
  </div>`;
}

function trackMarkup(orderId = "", order = null, message = "") {
  return `<p class="eyebrow">A LITTLE REASSURANCE</p><h2 id="dialog-title">Order tracking.</h2>
    <p class="dialog-intro">Your order and payment status come from your authenticated account. Sign in with the account used at checkout.</p>
    <form class="track-form" id="track-form"><label class="visually-hidden" for="track-id">Order reference</label><input id="track-id" name="orderId" placeholder="AJ-…" value="${escapeHtml(orderId)}" required><button type="submit">Find my order</button></form>
    <p class="form-error" id="tracking-error">${escapeHtml(message)}</p>
    ${order ? trackingResultMarkup(order) : ""}
    ${hasSession() && !orderId ? `<p class="form-hint">Recent orders are available from your account.</p>` : ""}`;
}

async function openTracking(orderId = "", message = "") {
  if (!hasSession()) return openAccount("Sign in to view orders belonging to your account.", "signin");
  openDialog(`<p class="eyebrow">A LITTLE REASSURANCE</p><h2 id="dialog-title">Loading order…</h2>`);
  if (!orderId) return openDialog(trackMarkup("", null, message));
  try {
    const order = await getOrderByReference(orderId.trim());
    openDialog(trackMarkup(orderId, order, order ? message : "We couldn’t find that order in your account. Check the reference and try again."));
  } catch (error) {
    openDialog(trackMarkup(orderId, null, error.message));
  }
}

function renderPaymentResult(status, reference, error = "") {
  const heading = status === "paid" ? "Payment confirmed." :
    status === "failed" ? "Payment wasn’t completed." :
      status === "cancelled" ? "Checkout was cancelled." : "Payment is still pending.";
  const description = error || (status === "paid"
    ? "Paystack confirmed this payment with our server. Your order is saved in your account."
    : status === "failed"
      ? "Paystack reported an unsuccessful payment. You can review this order in your account."
      : status === "cancelled"
        ? "No payment confirmation was received. The order remains pending unless Paystack verifies a payment."
        : "We could not confirm a final payment result yet. Check again from your account; a redirect alone never marks an order paid.");
  openDialog(`<p class="eyebrow">PAYSTACK CHECKOUT</p><h2 id="dialog-title">${heading}</h2><p class="dialog-intro">${escapeHtml(description)}</p>
    ${reference ? `<div class="account-card"><strong>Order reference</strong><p>${escapeHtml(reference)}</p></div>` : ""}
    <button class="dialog-action" data-action="account">View my account and orders</button><button class="text-action" data-action="track-order" data-id="${escapeHtml(reference || "")}">View this order</button>`);
}

async function handlePaymentReturn() {
  const url = new URL(window.location.href);
  const payment = url.searchParams.get("payment");
  if (!payment) return;
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref") || "";
  url.searchParams.delete("payment");
  url.searchParams.delete("reference");
  url.searchParams.delete("trxref");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  if (!reference) return renderPaymentResult("pending", "", "No transaction reference was returned. Check your account before trying again.");
  if (!hasSession()) return renderPaymentResult("pending", reference, "Sign in to the account used for checkout to verify this payment.");
  if (payment !== "return") return renderPaymentResult("cancelled", reference);
  try {
    const result = await verifyPayment(reference);
    if (result.payment_status === "paid") {
      state.cart = [];
      persist();
    }
    renderPaymentResult(result.payment_status, reference);
  } catch (error) {
    renderPaymentResult("pending", reference, error.message);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (button) {
    const { action, id } = button.dataset;
    if (action === "close") closeDialog();
    if (action === "cart") openCart();
    if (action === "account") await openAccount();
    if (action === "account-retry") await openAccount();
    if (action === "auth-mode") openDialog(accountMarkup("", button.dataset.mode));
    if (action === "google-signin") {
      try {
        await startGoogleSignIn(window.location.pathname === "/checkout" ? "/checkout" : "/");
      } catch (error) {
        openDialog(accountMarkup(error.message, "signin"));
      }
    }
    if (action === "track") await openTracking();
    if (action === "wishlist") {
      wishlistOnly = true;
      selectedCategory = "All";
      $("#product-search").value = "";
      renderProducts();
      $("#shop").scrollIntoView({ behavior: "smooth" });
    }
    if (action === "favorite") {
      toggleWishlist(state, id);
      persist();
      renderProducts();
      showToast(state.wishlist.includes(id) ? "Saved for another day." : "Removed from your saved things.");
    }
    if (action === "add") {
      try {
        addToCart(state, id);
        persist();
        showToast("A lovely choice. Added to your bag.");
      } catch (error) {
        showToast(error.message);
      }
    }
    if (action === "quantity") {
      try {
        setCartQuantity(state, id, Number(button.dataset.quantity));
        persist();
        openCart();
      } catch (error) {
        showToast(error.message);
      }
    }
    if (action === "remove") {
      setCartQuantity(state, id, 0);
      persist();
      openCart();
    }
    if (action === "checkout") await openCheckout();
    if (action === "continue") {
      closeDialog();
      $("#shop").scrollIntoView({ behavior: "smooth" });
    }
    if (action === "signout") {
      await shoppingSaveQueue;
      stopCustomerCartSubscription();
      try {
        await signOut();
      } catch (error) {
        showToast(`Signed out locally. ${error.message}`);
      }
      accountUser = null;
      accountProfile = null;
      accountOrders = [];
      state = emptyState();
      window.localStorage.removeItem(SHOPPING_OWNER_KEY);
      saveState(window.localStorage, state);
      renderBadges();
      renderProducts();
      await openAccount();
    }
    if (action === "track-order" && id) await openTracking(id);
  }
  const category = event.target.closest("[data-category]");
  if (category) {
    selectedCategory = category.dataset.category;
    wishlistOnly = false;
    renderProducts();
  }
  if (event.target === overlay) closeDialog();
});

document.addEventListener("submit", async (event) => {
  if (event.target.id === "account-form") {
    event.preventDefault();
    const formElement = event.target;
    const form = new FormData(formElement);
    const mode = formElement.dataset.mode;
    const errorElement = $("#account-error");
    errorElement.textContent = "";
    try {
      if (mode === "signup") {
        const result = await signUp(String(form.get("email")).trim(), String(form.get("password")), String(form.get("name")).trim());
        if (result.access_token) {
          await hydrateCustomerShoppingState();
          await openAccount();
          showToast("Your Supabase account is ready.");
        } else {
          openAccount("Check your email for a confirmation link, then sign in.", "signin");
        }
      } else {
        await signIn(String(form.get("email")).trim(), String(form.get("password")));
        await hydrateCustomerShoppingState();
        await openAccount();
        showToast("You’re signed in.");
      }
    } catch (error) {
      errorElement.textContent = error.message;
    }
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target).entries());
    const errorElement = $("#profile-error");
    errorElement.textContent = "";
    try {
      accountProfile = await updateProfile({ ...accountProfile, ...form });
      accountOrders = await getOrders();
      openDialog(accountMarkup("Delivery details saved."));
      showToast("Your delivery details were saved.");
    } catch (error) {
      errorElement.textContent = error.message;
    }
  }
  if (event.target.id === "checkout-form") {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    const details = Object.fromEntries(new FormData(event.target).entries());
    const errorElement = $("#checkout-error");
    errorElement.textContent = "";
    button.disabled = true;
    button.textContent = "Preparing secure checkout…";
    try {
      accountProfile = await updateProfile({ ...accountProfile, ...details });
      const items = state.cart.map(({ productId, quantity }) => ({ productId, quantity }));
      const result = await createCheckout(items);
      if (!/^https:\/\/checkout\.paystack\.com\//i.test(result.authorization_url || "")) {
        throw new Error("Paystack returned an unexpected checkout URL. No redirect was made.");
      }
      window.location.assign(result.authorization_url);
    } catch (error) {
      errorElement.textContent = error.message;
      button.disabled = false;
      button.textContent = "Continue to secure payment";
    }
  }
  if (event.target.id === "track-form") {
    event.preventDefault();
    const orderId = new FormData(event.target).get("orderId");
    await openTracking(String(orderId).trim());
  }
  if (event.target.id === "newsletter-form") {
    event.preventDefault();
    event.target.reset();
    showToast("Thanks for stopping by our studio.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !overlay.hidden) closeDialog();
  if (event.key === "Tab" && !overlay.hidden) {
    const focusable = [...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')];
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault();
      focusable[0].focus();
    }
  }
});

$("#product-search").addEventListener("input", renderProducts);
$("#year").textContent = new Date().getFullYear();
renderBadges();
renderProducts();
handlePaymentReturn();
if (hasSession()) hydrateCustomerShoppingState().catch((error) => {
  showToast(`Your account bag could not be loaded. ${error.message}`);
});
