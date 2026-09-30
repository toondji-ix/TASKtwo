import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_STORAGE_KEY, PRODUCTS, STORAGE_KEY, addToCart, cartCount, cartTotalKobo,
  emptyState, loadState, saveState, setCartQuantity, toggleWishlist
} from "../src/store.js";

function memoryStorage(value = null, legacyValue = null) {
  return {
    value,
    legacyValue,
    getItem(key) {
      if (key === STORAGE_KEY) return this.value;
      return key === LEGACY_STORAGE_KEY ? this.legacyValue : null;
    },
    setItem(key, content) { if (key === STORAGE_KEY) this.value = content; }
  };
}

test("catalog has eight products priced as exact NGN kobo integers", () => {
  assert.equal(PRODUCTS.length, 8);
  assert.deepEqual(new Set(PRODUCTS.map((product) => product.category)), new Set(["Bags", "Jewelry", "Sunglasses"]));
  assert.ok(PRODUCTS.every((product) => Number.isSafeInteger(product.priceKobo) && product.priceKobo > 0));
});

test("cart totals kobo precisely and survives reload without account or order data", () => {
  const storage = memoryStorage();
  const state = emptyState();
  addToCart(state, "arc-bag");
  addToCart(state, "arc-bag");
  addToCart(state, "little-hoops");
  assert.equal(cartCount(state), 3);
  assert.equal(cartTotalKobo(state), 45500000);
  setCartQuantity(state, "arc-bag", 1);
  setCartQuantity(state, "little-hoops", 0);
  saveState(storage, state);
  const reloaded = loadState(storage);
  assert.deepEqual(reloaded.cart, [{ productId: "arc-bag", quantity: 1 }]);
  assert.deepEqual(Object.keys(JSON.parse(storage.value)).sort(), ["cart", "wishlist"]);
  assert.equal(cartTotalKobo(reloaded), 18500000);
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

test("cart rejects unknown products and quantities outside supported bounds", () => {
  const state = emptyState();
  assert.throws(() => addToCart(state, "unknown"), /available item/);
  assert.throws(() => setCartQuantity(state, "arc-bag", 21), /up to 20/);
  for (let index = 0; index < 20; index += 1) addToCart(state, "arc-bag");
  assert.throws(() => addToCart(state, "arc-bag"), /up to 20/);
});

test("corrupt or untrusted saved state recovers without restoring demo accounts or orders", () => {
  assert.deepEqual(loadState(memoryStorage("{")), emptyState());
  const restored = loadState(memoryStorage(JSON.stringify({
    accounts: [{ email: "owner@example.com" }],
    orders: [{ id: "fake-paid-order", payment_status: "paid" }],
    currentEmail: "owner@example.com",
    cart: [{ productId: "arc-bag", quantity: 500 }],
    wishlist: ["unknown"]
  })));
  assert.deepEqual(restored, emptyState());
});

test("legacy browser demo state retains the cart but never restores local accounts or orders", () => {
  const legacy = JSON.stringify({
    cart: [{ productId: "arc-bag", quantity: 2 }],
    wishlist: ["soft-chain"],
    accounts: [{ email: "owner@example.com", name: "Fake Owner" }],
    orders: [{ id: "AJ-FAKE", payment_status: "paid" }],
    currentEmail: "owner@example.com"
  });
  const migrated = loadState(memoryStorage(null, legacy));
  assert.deepEqual(migrated, {
    cart: [{ productId: "arc-bag", quantity: 2 }],
    wishlist: ["soft-chain"]
  });
});
