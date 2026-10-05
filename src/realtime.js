import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";
import { getAccessToken } from "./backend.js";

export async function subscribeToCustomerCart(userId, onChange, onError) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.2?bundle");
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    accessToken: getAccessToken
  });
  const channel = client
    .channel(`customer-cart:${userId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "customer_cart",
      filter: `user_id=eq.${userId}`
    }, onChange)
    .subscribe((status, error) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError(error || new Error(`Cart sync connection ${status.toLowerCase()}.`));
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}
