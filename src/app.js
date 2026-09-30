import {
  PRODUCTS, STORAGE_KEY, accessAccount, addToCart, cartCount, cartTotal,
  emptyState, findOrder, loadState, placeOrder, saveState, setCartQuantity,
  toggleWishlist
} from "./store.js";

const $ = (selector, root = document) => root.querySelector(selector);
const money = (amount) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
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

function persist() {
  saveState(window.localStorage, state);
  renderBadges();
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
      <div class="product-name-row"><span class="product-name">${product.name}</span><span class="product-price">${money(product.price)}</span></div>
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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function openDialog(markup) {
  content.innerHTML = markup;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  dialog.focus();
}

function closeDialog() {
  overlay.hidden = true;
  document.body.style.overflow = "";
}

function deliveryFee(subtotal) {
  return subtotal >= 100 ? 0 : 8;
}

function cartMarkup() {
  const subtotal = cartTotal(state);
  if (!state.cart.length) return `<p class="eyebrow">YOUR EVERYDAY EDIT</p><h2 id="dialog-title">Your bag.</h2><div class="empty-cart">A little room for something lovely.<p>Your bag is waiting to be filled.</p></div><button class="dialog-action" data-action="continue">Explore the collection</button>`;
  const rows = state.cart.map(({ productId, quantity }) => {
    const product = PRODUCTS.find((entry) => entry.id === productId);
    if (!product) return "";
    return `<article class="cart-item">
      <img src="${product.image}" alt="${product.alt}">
      <div><p class="cart-item-name">${product.name}</p><p class="cart-item-meta">${product.color}</p>
        <div class="stepper"><button data-action="quantity" data-id="${product.id}" data-quantity="${quantity - 1}" aria-label="Decrease ${product.name} quantity">−</button><span>${quantity}</span><button data-action="quantity" data-id="${product.id}" data-quantity="${quantity + 1}" aria-label="Increase ${product.name} quantity">＋</button></div>
        <button class="remove-item" data-action="remove" data-id="${product.id}">Remove</button>
      </div><span class="cart-item-price">${money(product.price * quantity)}</span>
    </article>`;
  }).join("");
  const shipping = deliveryFee(subtotal);
  return `<p class="eyebrow">YOUR EVERYDAY EDIT · ${cartCount(state)} ${cartCount(state) === 1 ? "PIECE" : "PIECES"}</p><h2 id="dialog-title">Your bag.</h2>
    <div class="cart-list">${rows}</div>
    <p class="shipping-note">${shipping ? `Add ${money(100 - subtotal)} for complimentary delivery.` : "Complimentary delivery on this order."}</p>
    <div class="summary-row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Complimentary"}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>${money(subtotal + shipping)}</span></div>
    <button class="dialog-action" data-action="checkout">Continue to checkout</button>
    <p class="form-hint">Demo checkout only. No payment information is collected and no payment is processed.</p>`;
}

function openCart() {
  openDialog(cartMarkup());
}

function accountMarkup(message = "") {
  const account = state.accounts.find((entry) => entry.email === state.currentEmail);
  if (account) {
    const orders = state.orders.filter((order) => order.email === account.email);
    const orderMarkup = orders.length ? `<div class="order-list">${orders.map((order) => `<div class="order-entry"><div><strong>${escapeHtml(order.id)}</strong><p>${new Date(order.createdAt).toLocaleDateString()} · ${money(order.total)}</p></div><button class="mini-button" data-action="track-order" data-id="${escapeHtml(order.id)}">Track order</button></div>`).join("")}</div>` : `<p class="form-hint">Your placed orders will find a home here.</p>`;
    return `<p class="eyebrow">YOUR LITTLE CORNER</p><h2 id="dialog-title">Hello, ${escapeHtml(account.name.split(" ")[0])}.</h2>
      <div class="account-card"><strong>${escapeHtml(account.name)}</strong><p>${escapeHtml(account.email)}</p><p>Demo account · saved only in this browser</p></div>
      <h3 class="eyebrow">YOUR ORDERS</h3>${orderMarkup}
      <button class="text-action" data-action="signout">Sign out of this demo account</button>
      ${message ? `<p class="form-error">${message}</p>` : ""}`;
  }
  return `<p class="eyebrow">A PLACE OF YOUR OWN</p><h2 id="dialog-title">Your account.</h2>
    <p class="dialog-intro">Save your favorite things and find your orders in one place. This is a demo account stored on this device, not a secure login.</p>
    <form id="account-form"><div class="form-grid">
      <div class="form-field full"><label for="account-email">Email address</label><input id="account-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required></div>
      <div class="form-field full"><label for="account-name">Your name <span>(for a new account)</span></label><input id="account-name" name="name" autocomplete="name" placeholder="June Smith"></div>
    </div><p class="form-error" id="account-error">${message}</p>
    <button class="dialog-action" type="submit" data-mode="create">Create a demo account</button>
    <button class="text-action" type="submit" data-mode="access">I already have a demo account</button>
    </form><p class="form-hint">For an existing account, enter its email above and choose “I already have a demo account.” No password or identity check is used.</p>`;
}

function openAccount(message = "") {
  openDialog(accountMarkup(message));
}

function checkoutMarkup() {
  const account = state.accounts.find((entry) => entry.email === state.currentEmail);
  const subtotal = cartTotal(state);
  const shipping = deliveryFee(subtotal);
  return `<p class="eyebrow">A FEW DETAILS AND YOU’RE DONE</p><h2 id="dialog-title">Your delivery.</h2>
    <p class="dialog-intro">A simulated checkout for your ${cartCount(state) === 1 ? "piece" : "pieces"}. No payment details are requested or processed.</p>
    <form id="checkout-form"><div class="form-grid">
      <div class="form-field full"><label for="checkout-name">Full name *</label><input id="checkout-name" name="name" autocomplete="name" value="${escapeHtml(account?.name ?? "")}" required></div>
      <div class="form-field full"><label for="checkout-email">Email address *</label><input id="checkout-email" name="email" type="email" autocomplete="email" value="${escapeHtml(account?.email ?? "")}" required></div>
      <div class="form-field full"><label for="checkout-address">Street address *</label><input id="checkout-address" name="address" autocomplete="street-address" required></div>
      <div class="form-field"><label for="checkout-city">City *</label><input id="checkout-city" name="city" autocomplete="address-level2" required></div>
      <div class="form-field"><label for="checkout-postal">Postal code *</label><input id="checkout-postal" name="postal" autocomplete="postal-code" required></div>
      <div class="form-field full"><label for="checkout-country">Country / region *</label><select id="checkout-country" name="country" autocomplete="country-name" required><option value="">Choose a country</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option><option>France</option><option>Germany</option><option>Other</option></select></div>
    </div><p class="form-error" id="checkout-error"></p>
    <div class="summary-row" style="margin-top:18px"><span>Items</span><span>${money(subtotal)}</span></div>
    <div class="summary-row"><span>Delivery</span><span>${shipping ? money(shipping) : "Complimentary"}</span></div>
    <div class="summary-row summary-total"><span>Total · simulated</span><span>${money(subtotal + shipping)}</span></div>
    <button class="dialog-action" type="submit">Place demo order</button>
    </form><p class="form-hint">No card details or payment credentials are collected. Delivery and all order progress are simulated for this storefront demo.</p>`;
}

function openCheckout() {
  if (!state.cart.length) return openCart();
  openDialog(checkoutMarkup());
  $("#checkout-name").focus();
}

function trackingStage(order) {
  const elapsed = Date.now() - new Date(order.createdAt).getTime();
  if (elapsed >= 40_000) return 2;
  if (elapsed >= 12_000) return 1;
  return 0;
}

function trackingResultMarkup(order) {
  const stage = trackingStage(order);
  const steps = ["Order received", "Preparing your parcel", "On its way"];
  const items = order.items.map((item) => {
    const product = PRODUCTS.find((entry) => entry.id === item.productId);
    return product ? `${product.name} × ${item.quantity}` : "";
  }).filter(Boolean).join(" · ");
  return `<div class="tracking-card"><h3>${steps[stage]}</h3><p>Order ${escapeHtml(order.id)} · placed ${new Date(order.createdAt).toLocaleDateString()} · ${money(order.total)} total</p>
    <div class="progress-track" aria-label="Simulated delivery progress">${steps.map((step, index) => `<div class="progress-step${index <= stage ? " complete" : ""}">${step}</div>`).join("")}</div>
    <p class="order-items">${items}<br>Delivery progress is illustrative only. No parcel has been booked or shipped.</p>
  </div>`;
}

function trackMarkup(orderId = "") {
  const result = orderId ? findOrder(state, orderId) : null;
  return `<p class="eyebrow">A LITTLE REASSURANCE</p><h2 id="dialog-title">Order tracking.</h2>
    <p class="dialog-intro">Enter the reference from your demo order. There’s no real shipment behind this simulated tracking.</p>
    <form class="track-form" id="track-form"><label class="visually-hidden" for="track-id">Order reference</label><input id="track-id" name="orderId" placeholder="AJ-…" value="${escapeHtml(orderId)}" required><button type="submit">Find my order</button></form>
    <p class="form-error" id="tracking-error"></p>
    ${result ? trackingResultMarkup(result) : orderId ? `<p class="form-error">We couldn’t find that order. Check the reference and try again.</p>` : ""}
    ${state.orders.length && !orderId ? `<p class="form-hint">Recent demo references: ${state.orders.slice(0, 3).map((order) => `<button class="text-action" style="display:inline;margin:0 5px" data-action="track-order" data-id="${escapeHtml(order.id)}">${escapeHtml(order.id)}</button>`).join("")}</p>` : ""}`;
}

function openTracking(orderId = "") {
  openDialog(trackMarkup(orderId));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (button) {
    const { action, id } = button.dataset;
    if (action === "close") closeDialog();
    if (action === "cart") openCart();
    if (action === "account") openAccount();
    if (action === "track") openTracking();
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
      addToCart(state, id);
      persist();
      showToast("A lovely choice. Added to your bag.");
    }
    if (action === "quantity") {
      setCartQuantity(state, id, Number(button.dataset.quantity));
      persist();
      openCart();
    }
    if (action === "remove") {
      setCartQuantity(state, id, 0);
      persist();
      openCart();
    }
    if (action === "checkout") openCheckout();
    if (action === "continue") {
      closeDialog();
      $("#shop").scrollIntoView({ behavior: "smooth" });
    }
    if (action === "signout") {
      state.currentEmail = "";
      persist();
      openAccount();
    }
    if (action === "track-order") openTracking(id);
  }
  const category = event.target.closest("[data-category]");
  if (category) {
    selectedCategory = category.dataset.category;
    wishlistOnly = false;
    renderProducts();
  }
  if (event.target === overlay) closeDialog();
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "account-form") {
    event.preventDefault();
    const submitter = event.submitter;
    const form = new FormData(event.target);
    const email = form.get("email");
    const name = form.get("name");
    try {
      if (submitter?.dataset.mode === "access" && !state.accounts.some((account) => account.email === String(email).trim().toLowerCase())) {
        throw new Error("No demo account uses that email yet. Add your name to create one.");
      }
      const result = accessAccount(state, { name: submitter?.dataset.mode === "access" ? "" : name, email });
      state = result.state;
      persist();
      openAccount();
      showToast(result.created ? "Your demo account is ready." : "Welcome back to your demo account.");
    } catch (error) {
      $("#account-error").textContent = error.message;
    }
  }
  if (event.target.id === "checkout-form") {
    event.preventDefault();
    const details = Object.fromEntries(new FormData(event.target).entries());
    try {
      const order = placeOrder(state, details, () => `AJ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
      persist();
      openDialog(`<p class="eyebrow">THANK YOU · YOUR DEMO ORDER IS IN</p><h2 id="dialog-title">A good thing is coming.</h2><p class="dialog-intro">Your order has been saved in this browser. No payment was taken and no delivery was booked.</p>${trackingResultMarkup(order)}<div class="account-card"><strong>Your reference</strong><p>${order.id} · keep this to look up your order later.</p></div><button class="dialog-action" data-action="track-order" data-id="${order.id}">View order tracking</button><button class="text-action" data-action="account">Find this order in your demo account</button>`);
      showToast("Your simulated order is all set.");
    } catch (error) {
      $("#checkout-error").textContent = error.message;
    }
  }
  if (event.target.id === "track-form") {
    event.preventDefault();
    const orderId = new FormData(event.target).get("orderId");
    openTracking(String(orderId).trim());
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
