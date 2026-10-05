import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import "react-native-url-polyfill/auto";
import { makeRedirectUri } from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createClient, type Session } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../src/config.js";
import { PRODUCTS } from "../../src/store.js";

type CartItem = { productId: string; quantity: number };
type ShopContextValue = {
  session: Session | null;
  authLoading: boolean;
  cartLoading: boolean;
  cartLoaded: boolean;
  actionLoading: boolean;
  cart: CartItem[];
  cartCount: number;
  subtotal: number;
  delivery: number;
  message: string;
  syncError: string;
  setMessage: (message: string) => void;
  addItem: (productId: string) => void;
  changeQuantity: (productId: string, quantity: number) => void;
  refreshCart: () => Promise<void>;
  retryCartSync: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  checkout: () => Promise<void>;
};

const secureSessionStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
    persistSession: true,
    storage: secureSessionStorage,
  },
});

const ShopContext = createContext<ShopContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ShopProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cartLoading, setCartLoading] = useState(false);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [message, setMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const cartRef = useRef<CartItem[]>([]);
  const wishlistRef = useRef<string[]>([]);
  const currentUserId = useRef<string | null>(null);
  const cartWriteQueue = useRef<Promise<void>>(Promise.resolve());

  const setCurrentCart = useCallback((next: CartItem[]) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const refreshCart = useCallback(async () => {
    const requestedUserId = currentUserId.current;
    if (!requestedUserId) throw new Error("Sign in to load your bag.");
    const [cartResult, wishlistResult] = await Promise.all([
      supabase.from("customer_cart").select("product_id,quantity").order("product_id", { ascending: true }),
      supabase.from("customer_wishlist").select("product_id").order("product_id", { ascending: true }),
    ]);
    if (cartResult.error) throw cartResult.error;
    if (wishlistResult.error) throw wishlistResult.error;
    if (currentUserId.current !== requestedUserId) return;
    setCurrentCart((cartResult.data ?? []).map((item) => ({
      productId: item.product_id,
      quantity: item.quantity,
    })));
    wishlistRef.current = (wishlistResult.data ?? []).map((item) => item.product_id);
    setCartLoaded(true);
    setSyncError("");
  }, [setCurrentCart]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(`Could not restore your session: ${error.message}`);
      currentUserId.current = data.session?.user.id ?? null;
      setCartLoading(Boolean(data.session));
      setCartLoaded(false);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setMessage(`Could not restore your session: ${errorMessage(error)}`);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      currentUserId.current = nextSession?.user.id ?? null;
      setSession(nextSession);
      setMessage("");
      if (!nextSession) {
        setCurrentCart([]);
        wishlistRef.current = [];
        setCartLoading(false);
        setCartLoaded(false);
        setSyncError("");
      } else if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setCartLoading(true);
        setCartLoaded(false);
      }
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [setCurrentCart]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setCurrentCart([]);
      wishlistRef.current = [];
      setCartLoading(false);
      setCartLoaded(false);
      return;
    }

    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    setCartLoading(true);
    setCartLoaded(false);
    setCurrentCart([]);
    wishlistRef.current = [];
    setSyncError("");
    refreshCart()
      .catch((error: unknown) => {
        if (active) setSyncError(`Could not load your saved bag. ${errorMessage(error)}`);
      })
      .finally(() => {
        if (active) setCartLoading(false);
      });

    const channel = supabase
      .channel(`mobile-customer-cart:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_cart",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            if (active) {
              refreshCart().catch((error: unknown) => {
                if (active) setSyncError(`Could not refresh your shared bag. ${errorMessage(error)}`);
              });
            }
          }, 100);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_wishlist",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => {
            if (active) {
              refreshCart().catch((error: unknown) => {
                if (active) setSyncError(`Could not refresh your shared bag. ${errorMessage(error)}`);
              });
            }
          }, 100);
        },
      )
      .subscribe((status, error) => {
        if (!active) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncError(`Live bag sync disconnected. ${error?.message ?? status}.`);
        }
      });

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [refreshCart, session?.user.id, setCurrentCart]);

  const saveCart = useCallback((next: CartItem[]) => {
    const ownerId = currentUserId.current;
    if (!ownerId) {
      setMessage("Sign in to save your bag.");
      return;
    }
    setCurrentCart(next);
    setSyncError("");
    const snapshot = next.map((item) => ({ ...item }));
    cartWriteQueue.current = cartWriteQueue.current
      .catch(() => undefined)
      .then(async () => {
        if (currentUserId.current !== ownerId) return;
        const { data: wishlist, error: wishlistError } = await supabase
          .from("customer_wishlist")
          .select("product_id")
          .order("product_id", { ascending: true });
        if (wishlistError) throw wishlistError;
        if (currentUserId.current !== ownerId) return;
        wishlistRef.current = (wishlist ?? []).map((item) => item.product_id);
        const { error } = await supabase.rpc("replace_customer_shopping_state", {
          p_cart: snapshot.map(({ productId, quantity }) => ({
            product_id: productId,
            quantity,
          })),
          p_wishlist: wishlistRef.current.map((productId) => ({ product_id: productId })),
        });
        if (error) throw error;
      })
      .catch((error: unknown) => {
        setSyncError(`Your bag could not be saved. ${errorMessage(error)}`);
        throw error;
      });
    void cartWriteQueue.current.catch(() => undefined);
  }, [setCurrentCart]);

  const addItem = useCallback((productId: string) => {
    if (!session) {
      setMessage("Sign in to add a piece and keep your bag in sync.");
      return;
    }
    if (cartLoading || !cartLoaded) {
      setMessage("Loading your saved bag. Please try again in a moment.");
      return;
    }
    if (!PRODUCTS.some((product) => product.id === productId)) {
      setMessage("That piece is not available.");
      return;
    }
    const existing = cartRef.current.find((item) => item.productId === productId);
    if (existing && existing.quantity >= 20) {
      setMessage("You can add up to 20 of each piece.");
      return;
    }
    saveCart(existing
      ? cartRef.current.map((item) => item.productId === productId
        ? { ...item, quantity: item.quantity + 1 }
        : item)
      : [...cartRef.current, { productId, quantity: 1 }]);
    const product = PRODUCTS.find((entry) => entry.id === productId);
    setMessage(`${product?.name ?? "Piece"} added to your bag.`);
  }, [cartLoaded, cartLoading, saveCart, session]);

  const changeQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity > 20) {
      setMessage("You can add up to 20 of each piece.");
      return;
    }
    saveCart(quantity < 1
      ? cartRef.current.filter((item) => item.productId !== productId)
      : cartRef.current.map((item) => item.productId === productId
        ? { ...item, quantity }
        : item));
  }, [saveCart]);

  const signIn = useCallback(async (email: string, password: string) => {
    setActionLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setMessage("You’re signed in. Your bag is shared with the website.");
    } catch (error) {
      setMessage(`Could not sign in. ${errorMessage(error)}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setActionLoading(true);
    setMessage("");
    try {
      const redirectTo = makeRedirectUri({
        scheme: "atelierjune",
        path: "auth/callback",
      });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (!data.url) throw new Error("Supabase did not return a Google sign-in link.");

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") {
        setMessage("Google sign-in was cancelled.");
        return;
      }
      const callback = new URL(result.url);
      const providerError = callback.searchParams.get("error_description")
        || callback.searchParams.get("error");
      if (providerError) throw new Error(providerError);
      const code = callback.searchParams.get("code");
      if (!code) throw new Error("Google sign-in did not return an authorization code.");
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      setMessage("You’re signed in. Your bag is shared with the website.");
    } catch (error) {
      setMessage(`Could not sign in with Google. ${errorMessage(error)}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setActionLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setMessage(`Could not sign out. ${errorMessage(error)}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const checkout = useCallback(async () => {
    if (!session) {
      setMessage("Sign in to continue to checkout.");
      return;
    }
    setActionLoading(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          items: cartRef.current.map(({ productId, quantity }) => ({
            productId,
            quantity,
          })),
        },
      });
      if (error) throw error;
      if (!/^https:\/\/checkout\.paystack\.com\//i.test(data?.authorization_url ?? "")) {
        throw new Error("The secure checkout returned an unexpected payment link.");
      }
      await WebBrowser.openBrowserAsync(data.authorization_url);
      await refreshCart();
    } catch (error) {
      setMessage(`Checkout could not be started. ${errorMessage(error)}`);
      throw error;
    } finally {
      setActionLoading(false);
    }
  }, [refreshCart, session]);

  const retryCartSync = useCallback(() => {
    setSyncError("");
    if (!cartLoaded) {
      refreshCart().catch((error: unknown) => {
        setSyncError(`Could not refresh your shared bag. ${errorMessage(error)}`);
      });
      return;
    }
    saveCart(cartRef.current);
    cartWriteQueue.current.then(refreshCart).catch((error: unknown) => {
      setSyncError(`Could not refresh your shared bag. ${errorMessage(error)}`);
    });
  }, [cartLoaded, refreshCart, saveCart]);

  const count = cart.reduce((total, item) => total + item.quantity, 0);
  const subtotal = cart.reduce((total, item) => {
    const product = PRODUCTS.find((entry) => entry.id === item.productId);
    return total + (product ? product.priceKobo * item.quantity : 0);
  }, 0);
  const value = useMemo<ShopContextValue>(() => ({
    session,
    authLoading,
    cartLoading,
    cartLoaded,
    actionLoading,
    cart,
    cartCount: count,
    subtotal,
    delivery: subtotal >= 10_000_000 ? 0 : 800_000,
    message,
    syncError,
    setMessage,
    addItem,
    changeQuantity,
    refreshCart,
    retryCartSync,
    signIn,
    signInWithGoogle,
    signOut,
    checkout,
  }), [
    session, authLoading, cartLoading, cartLoaded, actionLoading, cart, count, subtotal,
    message, syncError, addItem, changeQuantity, refreshCart, retryCartSync,
    signIn, signInWithGoogle, signOut, checkout,
  ]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used inside ShopProvider.");
  return context;
}
