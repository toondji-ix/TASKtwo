import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCTS, STORAGE_KEY, accessAccount, addToCart, cartCount, cartTotal,
  emptyState, findOrder, loadState, placeOrder, saveState, setCartQuantity,
  toggleWishlist, validateCheckout
} from "../src/store.js";

function memoryStorage(value = null) {
  return {
    value,
    getItem(key) { return key === STORAGE_KEY ? this.value : null; },
    setItem(key, content) { if (key === STORAGE_KEY) this.value = content; }
  };
}

const validDetails = {
  name: "June Smith",
  email: "june@example.com",
  address: "12 Market Street",
  city: "Portland",
  postal: "97201",
  country: "United States"
};

test("catalog has bags, jewelry, and sunglasses to browse", () => {
  assert.deepEqual(new Set(PRODUCTS.map((product) => product.category)), new Set(["Bags", "Jewelry", "Sunglasses"]));
  assert.equal(PRODUCTS.length, 8);
});

test("cart updates quantities, totals, and survives a reload", () => {
  const storage = memoryStorage();
  const state = emptyState();
  addToCart(state, "arc-bag");
  addToCart(state, "arc-bag");
  addToCart(state, "little-hoops");
  assert.equal(cartCount(state), 3);
  assert.equal(cartTotal(state), 364);
  setCartQuantity(state, "arc-bag", 1);
  setCartQuantity(state, "little-hoops", 0);
  saveState(storage, state);
  const reloaded = loadState(storage);
  assert.deepEqual(reloaded.cart, [{ productId: "arc-bag", quantity: 1 }]);
  assert.equal(cartTotal(reloaded), 148);
});

test("wishlist toggles product membership and persists", () => {
  const state = emptyState();
  toggleWishlist(state, "soft-chain");
  toggleWishlist(state, "wide-frame");
  toggleWishlist(state, "soft-chain");
  const storage = memoryStorage();
  saveState(storage, state);
  assert.deepEqual(loadState(storage).wishlist, ["wide-frame"]);
});

test("demo account creation normalizes email and access restores an existing account", () => {
  const state = emptyState();
  const created = accessAccount(state, { name: "June Smith", email: "  JUNE@example.com " });
  assert.equal(created.created, true);
  assert.equal(created.account.email, "june@example.com");
  state.currentEmail = "";
  const accessed = accessAccount(state, { email: "JUNE@example.com" });
  assert.equal(accessed.created, false);
  assert.equal(state.currentEmail, "june@example.com");
  assert.equal(state.accounts.length, 1);
  assert.throws(() => accessAccount(state, { name: "June", email: "not-an-email" }), /valid email/);
});

test("checkout rejects missing and malformed details", () => {
  assert.equal(validateCheckout({ ...validDetails, postal: "" }).valid, false);
  assert.equal(validateCheckout({ ...validDetails, email: "invalid" }).valid, false);
  assert.equal(validateCheckout({ ...validDetails, postal: "1" }).valid, false);
  assert.equal(validateCheckout(validDetails).valid, true);
  assert.throws(() => placeOrder(emptyState(), validDetails), /bag is empty/);
});

test("simulated checkout records delivery, order items, and clears the cart", () => {
  const state = emptyState();
  addToCart(state, "arc-bag");
  addToCart(state, "little-hoops");
  const order = placeOrder(state, validDetails, () => "AJ-TEST01");
  assert.equal(order.id, "AJ-TEST01");
  assert.equal(order.total, 216);
  assert.equal(order.delivery, 0);
  assert.deepEqual(order.items, [{ productId: "arc-bag", quantity: 1 }, { productId: "little-hoops", quantity: 1 }]);
  assert.equal(cartCount(state), 0);
  assert.equal(findOrder(state, "aj-test01").id, "AJ-TEST01");
  assert.equal(findOrder(state, "AJ-TEST01", "someone@example.com"), null);
});

test("small demo orders include simulated delivery and minimum-free-shipping threshold", () => {
  const state = emptyState();
  addToCart(state, "little-hoops");
  const order = placeOrder(state, validDetails, () => "AJ-SMALL");
  assert.equal(order.delivery, 8);
  assert.equal(order.total, 76);
});

test("corrupt storage recovers safely and unknown products cannot enter shopping state", () => {
  assert.deepEqual(loadState(memoryStorage("{")), emptyState());
  assert.equal(loadState(memoryStorage(JSON.stringify({ orders: [{ id: "unsafe" }] }))).orders.length, 0);
  const state = emptyState();
  assert.throws(() => addToCart(state, "unknown"), /available item/);
  assert.throws(() => toggleWishlist(state, "unknown"), /available item/);
});
