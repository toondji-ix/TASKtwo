# Atelier June — Supabase and Paystack storefront

A responsive accessories storefront with a dependency-free static Node.js UI/server, Supabase Auth and Postgres, and secure Paystack test-mode checkout. Prices are displayed in Nigerian naira (NGN); database and payment amounts are integer kobo. Shipping/fulfilment is not connected.

## Requirements

- Node.js 18 or newer
- A Supabase project (or the Supabase CLI and Docker for local emulation)
- A Paystack account with **Test Mode** enabled for sandbox payments

## Run the storefront

```powershell
npm run start
```

Open <http://127.0.0.1:4173>. To select another port, set `$env:PORT` before starting. The server only serves static files; it does not contain provider credentials or implement a payment backend.

The bag and wishlist remain local shopping conveniences. Customer accounts, profile details, orders, and payment status are fetched from Supabase; legacy locally simulated accounts/orders are discarded when the app starts.

## Public browser configuration

Set only your project URL and Supabase publishable/anon key in `src/config.js`:

```js
export const SUPABASE_URL = "https://your-project-ref.supabase.co";
export const SUPABASE_ANON_KEY = "your-public-publishable-or-anon-key";
```

These two values are public browser configuration. **Never put a Supabase service-role/secret key or any Paystack secret key in `src/config.js`, HTML, browser storage, or a checked-in file.** The app intentionally reports an actionable setup error rather than using a demo account or pretending a payment succeeded.

## Database and authentication setup

1. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and authenticate with your own project.
2. Link the project and apply the SQL migration:

   ```powershell
   supabase login
   supabase link --project-ref your-project-ref
   supabase db push
   ```

   The migration creates the seeded NGN catalog, customer profiles, order/payment records and line items. Row Level Security restricts profiles and orders to their owner. Customers can update only their profile; they cannot create orders, edit order items, or change payment status.
3. In the Supabase dashboard, configure Auth email/password sign-up and the email confirmation and site/redirect URLs you want. Add your storefront origin (for local use, `http://127.0.0.1:4173`) to the Auth redirect allow list. The profile trigger creates a profile at sign-up. Users must sign in and complete their delivery details before checking out.

## Paystack Edge Functions and secrets

The deployable functions are `create-checkout`, `verify-payment`, and `paystack-webhook`. Checkout authenticates the Supabase user, loads their saved profile and server-side catalog, accepts only product IDs and quantities, creates a pending order, and initializes a Paystack transaction in NGN. The browser never supplies a price, email, address snapshot, order ID, or paid flag to checkout. Payment confirmation calls Paystack's verify API and checks reference, exact kobo amount and currency before an idempotent database transition. The webhook validates Paystack's HMAC-SHA-512 signature over the exact raw body and independently verifies the transaction with Paystack before applying the same checks and transition. An unauthenticated redirect alone never marks an order paid.

Set the function secrets through the Supabase CLI in your own secure shell (do not commit them or paste them into this repository):

```powershell
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_your_own_test_secret SITE_URL=http://127.0.0.1:4173
```

Use your **test** secret key, never the live key. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions; the service-role key remains function-side only. Keep the Paystack secret in Supabase Function Secrets only. For production-like hosting, set `SITE_URL` to the exact HTTPS origin/base URL used by your storefront. The current callback appends `/?payment=return`.

Deploy the functions:

```powershell
supabase functions deploy create-checkout
supabase functions deploy verify-payment
supabase functions deploy paystack-webhook
```

In Paystack Dashboard, stay in **Test Mode** and configure the webhook URL:

```text
https://your-project-ref.supabase.co/functions/v1/paystack-webhook
```

Paystack signs webhook messages with the same test secret key stored as `PAYSTACK_SECRET_KEY`. Do not expose the endpoint by disabling its signature verification. The app manually validates user JWTs in the two customer functions; the webhook is intentionally unauthenticated at the HTTP layer and requires a valid Paystack signature plus server verification.

## Local Supabase emulation

Install and start the Supabase CLI's local stack (Docker must be running). Create a local-only ignored `supabase/.env.local` containing your test-only `PAYSTACK_SECRET_KEY` and `SITE_URL=http://127.0.0.1:4173`, then serve the functions with it:

```powershell
supabase start
supabase db reset
supabase functions serve --env-file supabase/.env.local
```

The `.env.local` file is ignored by Git; do not commit it. Copy only the local API URL and anon/publishable key from `supabase status` into `src/config.js`; never copy its service-role key into browser code. Paystack's hosted webhook cannot call a loopback URL; use a secure public HTTPS tunnel to the local webhook only if you want to test local webhook delivery, or test webhooks against your deployed Supabase test project.

## Sandbox checkout smoke test

1. Confirm the browser config contains the correct Supabase URL and public key; deploy the migration and three functions; set test secrets; and enable Supabase email/password auth. Start the storefront and create an account using a reachable email. Confirm it if email confirmation is enabled, then sign in.
2. Save a complete name and delivery address under **Account**. Add a product and choose **Continue to checkout**. Verify the displayed NGN price and delivery estimate. Submit checkout and confirm that only the Paystack-hosted test checkout page requests card details.
3. Use a Paystack Test Mode card from the official [test payments guide](https://paystack.com/docs/payments/test-payments/), such as `4084 0840 8408 4081` with a future expiry, CVV `408`, and the test OTP shown in that guide. Sandbox test values can vary by scenario; use the current provider guide if a scenario requires different details. Do not use a real card.
4. Confirm the return screen says **Payment confirmed** only after server verification; open **Account** and verify the order reference, total, and payment state. Use **Order tracking** to retrieve that same authenticated order. Check the Paystack test dashboard and configured webhook delivery.
5. Repeat with a failed/cancelled test attempt. Confirm that it does not show a paid status, the cart remains available for retry, and a redirect without server verification never creates a success state. Test signing out and confirm that order references are not visible to another signed-out account.

No provider credentials or project access are included here. A real Supabase/Paystack-connected run cannot be claimed until you configure your own projects and complete these steps.

## Checks

```powershell
npm test
npm run check
```

The Node built-in tests cover kobo arithmetic, cart validation, exact transaction amount/currency/reference checks, webhook HMAC validation, and idempotent/non-downgrading payment-state behavior. `npm run check` includes client/server syntax checks and the tests. Deno and the Supabase CLI are not required project dependencies; when available, run `deno check supabase/functions/create-checkout/index.ts supabase/functions/verify-payment/index.ts supabase/functions/paystack-webhook/index.ts` and `supabase db lint` against your local stack. Complete the sandbox smoke test above against your own credentials before accepting test payments.
