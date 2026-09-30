export const PRODUCTS = [
  { id: "arc-bag", name: "The Arc Shoulder Bag", category: "Bags", price: 148, color: "Olive suede", label: "JUNE FAVORITE", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85", alt: "Soft sculptural leather shoulder bag" },
  { id: "daily-tote", name: "The Daily Carryall", category: "Bags", price: 176, color: "Warm cognac", label: "JUST IN", image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85", alt: "Structured everyday leather tote" },
  { id: "woven-pouch", name: "The Woven Pouch", category: "Bags", price: 92, color: "Natural raffia", label: "", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=900&q=85", alt: "Textured woven summer pouch" },
  { id: "little-hoops", name: "The Little Hoops", category: "Jewelry", price: 68, color: "Recycled gold vermeil", label: "BESTSELLER", image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=85", alt: "Sculptural gold hoop earrings" },
  { id: "soft-chain", name: "The Soft Chain", category: "Jewelry", price: 84, color: "Gold-plated sterling", label: "", image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85", alt: "Delicate gold chain necklace" },
  { id: "pearl-studs", name: "The Sunday Studs", category: "Jewelry", price: 54, color: "Freshwater pearl", label: "ONLY A FEW LEFT", image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85", alt: "Minimal freshwater pearl earrings" },
  { id: "wide-frame", name: "The Wide Frame", category: "Sunglasses", price: 112, color: "Honey tortoise", label: "JUNE FAVORITE", image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85", alt: "Classic tortoiseshell sunglasses" },
  { id: "slim-frame", name: "The Slim Frame", category: "Sunglasses", price: 98, color: "Deep espresso", label: "", image: "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=900&q=85", alt: "Slim dark acetate sunglasses" }
];

export const STORAGE_KEY = "atelier-june-demo-v1";

export function emptyState() {
  return { cart: [], wishlist: [], accounts: [], currentEmail: "", orders: [] };
}

export function loadState(storage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!value || typeof value !== "object") return emptyState();
    const productIds = new Set(PRODUCTS.map((product) => product.id));
    return {
      cart: Array.isArray(value.cart) ? value.cart.filter((item) => productIds.has(item?.productId) && Number.isInteger(item?.quantity) && item.quantity > 0) : [],
      wishlist: Array.isArray(value.wishlist) ? [...new Set(value.wishlist.filter((id) => productIds.has(id)))] : [],
      accounts: Array.isArray(value.accounts) ? value.accounts.filter((account) => account && typeof account.email === "string" && typeof account.name === "string") : [],
      currentEmail: typeof value.currentEmail === "string" ? value.currentEmail : "",
      orders: Array.isArray(value.orders) ? value.orders.filter((order) =>
        order && typeof order.id === "string" && typeof order.email === "string" &&
        typeof order.createdAt === "string" && Number.isFinite(Date.parse(order.createdAt)) &&
        Array.isArray(order.items) && Number.isFinite(order.total) && Number.isFinite(order.delivery)
      ).map((order) => ({
        ...order,
        items: order.items.filter((item) => productIds.has(item?.productId) && Number.isInteger(item?.quantity) && item.quantity > 0)
      })) : []
    };
  } catch {
    return emptyState();
  }
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function cartCount(state) {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartTotal(state) {
  return state.cart.reduce((sum, item) => {
    const product = PRODUCTS.find((entry) => entry.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);
}

export function addToCart(state, productId) {
  if (!PRODUCTS.some((product) => product.id === productId)) throw new Error("Choose an available item.");
  const item = state.cart.find((entry) => entry.productId === productId);
  if (item) item.quantity += 1;
  else state.cart.push({ productId, quantity: 1 });
  return state;
}

export function setCartQuantity(state, productId, quantity) {
  if (!Number.isInteger(quantity)) throw new Error("Quantity must be a whole number.");
  if (quantity <= 0) state.cart = state.cart.filter((item) => item.productId !== productId);
  else {
    const item = state.cart.find((entry) => entry.productId === productId);
    if (item) item.quantity = quantity;
  }
  return state;
}

export function toggleWishlist(state, productId) {
  if (!PRODUCTS.some((product) => product.id === productId)) throw new Error("Choose an available item.");
  const index = state.wishlist.indexOf(productId);
  if (index < 0) state.wishlist.push(productId);
  else state.wishlist.splice(index, 1);
  return state;
}

export function accessAccount(state, { name = "", email = "" }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid email address.");
  const existing = state.accounts.find((account) => account.email === normalizedEmail);
  if (existing) {
    state.currentEmail = normalizedEmail;
    return { state, account: existing, created: false };
  }
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Please enter your name to create an account.");
  const account = { name: cleanName, email: normalizedEmail, createdAt: new Date().toISOString() };
  state.accounts.push(account);
  state.currentEmail = normalizedEmail;
  return { state, account, created: true };
}

const REQUIRED_CHECKOUT_FIELDS = ["name", "email", "address", "city", "postal", "country"];

export function validateCheckout(details) {
  const missing = REQUIRED_CHECKOUT_FIELDS.filter((key) => !String(details[key] ?? "").trim());
  if (missing.length) return { valid: false, message: "Please complete every delivery detail." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) return { valid: false, message: "Please enter a valid email address." };
  if (details.postal.trim().length < 3) return { valid: false, message: "Please enter a valid postal code." };
  return { valid: true, message: "" };
}

export function placeOrder(state, details, createId = () => `AJ-${Date.now().toString(36).toUpperCase()}`) {
  const validation = validateCheckout(details);
  if (!validation.valid) throw new Error(validation.message);
  if (!state.cart.length) throw new Error("Your bag is empty.");
  const order = {
    id: createId(),
    email: details.email.trim().toLowerCase(),
    name: details.name.trim(),
    items: state.cart.map((item) => ({ ...item })),
    delivery: cartTotal(state) >= 100 ? 0 : 8,
    total: cartTotal(state) + (cartTotal(state) >= 100 ? 0 : 8),
    createdAt: new Date().toISOString(),
    status: "Order received"
  };
  state.orders.unshift(order);
  state.cart = [];
  return order;
}

export function findOrder(state, orderId, email = "") {
  const normalizedId = orderId.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  return state.orders.find((order) => order.id.toUpperCase() === normalizedId && (!normalizedEmail || order.email === normalizedEmail)) ?? null;
}
