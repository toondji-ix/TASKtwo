export const PRODUCTS = [
  { id: "arc-bag", name: "The Arc Shoulder Bag", category: "Bags", priceKobo: 18500000, color: "Olive suede", label: "JUNE FAVORITE", image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85", alt: "Soft sculptural leather shoulder bag" },
  { id: "daily-tote", name: "The Daily Carryall", category: "Bags", priceKobo: 22000000, color: "Warm cognac", label: "JUST IN", image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85", alt: "Structured everyday leather tote" },
  { id: "woven-pouch", name: "The Woven Pouch", category: "Bags", priceKobo: 11500000, color: "Natural raffia", label: "", image: "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=900&q=85", alt: "Textured woven summer pouch" },
  { id: "little-hoops", name: "The Little Hoops", category: "Jewelry", priceKobo: 8500000, color: "Recycled gold vermeil", label: "BESTSELLER", image: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=900&q=85", alt: "Sculptural gold hoop earrings" },
  { id: "soft-chain", name: "The Soft Chain", category: "Jewelry", priceKobo: 10500000, color: "Gold-plated sterling", label: "", image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85", alt: "Delicate gold chain necklace" },
  { id: "pearl-studs", name: "The Sunday Studs", category: "Jewelry", priceKobo: 6750000, color: "Freshwater pearl", label: "ONLY A FEW LEFT", image: "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85", alt: "Minimal freshwater pearl earrings" },
  { id: "wide-frame", name: "The Wide Frame", category: "Sunglasses", priceKobo: 14000000, color: "Honey tortoise", label: "JUNE FAVORITE", image: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85", alt: "Classic tortoiseshell sunglasses" },
  { id: "slim-frame", name: "The Slim Frame", category: "Sunglasses", priceKobo: 12250000, color: "Deep espresso", label: "", image: "https://images.unsplash.com/photo-1508296695146-257a814070b4?auto=format&fit=crop&w=900&q=85", alt: "Slim dark acetate sunglasses" }
];

export const STORAGE_KEY = "atelier-june-shopping-v1";
export const LEGACY_STORAGE_KEY = "atelier-june-demo-v1";
export const SHOPPING_OWNER_KEY = "atelier-june-shopping-owner-v1";

export function emptyState() {
  return { cart: [], wishlist: [] };
}

export function mergeShoppingStates(primary, secondary) {
  const cart = new Map();
  for (const item of [...(primary?.cart || []), ...(secondary?.cart || [])]) {
    if (!PRODUCTS.some((product) => product.id === item.productId)) continue;
    cart.set(item.productId, Math.min(20, (cart.get(item.productId) || 0) + item.quantity));
  }
  const validIds = new Set(PRODUCTS.map((product) => product.id));
  return {
    cart: [...cart].map(([productId, quantity]) => ({ productId, quantity })),
    wishlist: [...new Set([...(primary?.wishlist || []), ...(secondary?.wishlist || [])])]
      .filter((id) => validIds.has(id))
  };
}

export function loadState(storage) {
  try {
    const serialized = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    const value = JSON.parse(serialized);
    if (!value || typeof value !== "object") return emptyState();
    const productIds = new Set(PRODUCTS.map((product) => product.id));
    return {
      cart: Array.isArray(value.cart) ? value.cart.filter((item) =>
        productIds.has(item?.productId) && Number.isInteger(item?.quantity) && item.quantity > 0 && item.quantity <= 20
      ).map((item) => ({ productId: item.productId, quantity: item.quantity })) : [],
      wishlist: Array.isArray(value.wishlist) ? [...new Set(value.wishlist.filter((id) => productIds.has(id)))] : []
    };
  } catch {
    return emptyState();
  }
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ cart: state.cart, wishlist: state.wishlist }));
}

export function cartCount(state) {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartTotalKobo(state) {
  return state.cart.reduce((sum, item) => {
    const product = PRODUCTS.find((entry) => entry.id === item.productId);
    return sum + (product ? product.priceKobo * item.quantity : 0);
  }, 0);
}

export function addToCart(state, productId) {
  if (!PRODUCTS.some((product) => product.id === productId)) throw new Error("Choose an available item.");
  const item = state.cart.find((entry) => entry.productId === productId);
  if (item && item.quantity >= 20) throw new Error("You can add up to 20 of each piece.");
  if (item) item.quantity += 1;
  else state.cart.push({ productId, quantity: 1 });
  return state;
}

export function setCartQuantity(state, productId, quantity) {
  if (!Number.isInteger(quantity)) throw new Error("Quantity must be a whole number.");
  if (quantity <= 0) state.cart = state.cart.filter((item) => item.productId !== productId);
  else if (quantity > 20) throw new Error("You can add up to 20 of each piece.");
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
