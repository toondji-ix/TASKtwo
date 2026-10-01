# Goal: Complete checkout, email, and Google auth

## User Request

Do a checklist of the following criteria listed below for the ecommerce store:
- Add a checkout page
Persist everything in a database using Supabase/Neon.
- Send confirmation emails using Mailgun.
- Do Google auth using Google Cloud Console.

## Refined Goal

Complete the existing Atelier June storefront using its current Supabase project as the single source of truth. Replace the checkout modal with a dedicated responsive checkout page, persist signed-in customers' cart and wishlist as well as profiles and commerce orders in Supabase, route Supabase signup-verification email through Mailgun SMTP, send a Mailgun order confirmation only after Paystack payment is server-verified, and add Google sign-in through Supabase Auth configured with Google Cloud Console OAuth credentials. Provide precise setup/deployment steps for credentials and redirects; do not commit secrets or claim external integrations work without provider configuration.

## Acceptance Criteria

- [ ] Checkout is a dedicated responsive page/route that shows persisted cart line items, authoritative NGN totals, validates the customer's delivery profile, requires sign-in, and uses the existing secure Paystack-hosted checkout flow.
- [ ] Supabase is the source of truth for authenticated customer profiles, orders and order items, and each user's cart and wishlist; database schema supports the data with suitable constraints and owner-scoped RLS, with no cross-user reads/writes.
- [ ] Supabase email/password signup confirmation is delivered through Mailgun using Supabase Auth's custom SMTP settings; the app handles the confirmation callback and returns the customer to the store in a signed-in or clearly actionable state.
- [ ] Google sign-in uses Supabase Auth OAuth, and works with credentials configured in Google Cloud Console and Supabase; setup documents OAuth consent/client configuration, authorized redirect URI and storefront callback/allowed URLs. No Google client secret is exposed to the browser.
- [ ] A paid-order confirmation email is sent through the Mailgun API only after server-side Paystack verification; duplicate webhook/redirect processing must not cause duplicate order-confirmation emails, and payment must never be marked paid from unverified browser input.
- [ ] Mailgun API credentials and Google OAuth client secrets remain server-side (Supabase Auth SMTP settings / Edge Function secrets); public Supabase configuration contains only the URL and publishable/anon key. `.env` and local secret files remain untracked.
- [ ] README documents Supabase migrations, Mailgun SMTP and sending-domain setup, function secrets/deployment, Google Cloud Console + Supabase provider setup, redirect URLs, local/Vercel routing, and an end-to-end sandbox/manual checklist.
- [ ] Automated checks cover cart/wishlist persistence contracts, owner-only database access, auth callback behavior, email trigger/idempotence, and payment verification; available project quality gate passes. UI is browser-checked at desktop/mobile; real provider checks are explicitly noted as pending without user credentials.

## Scope Boundaries

**In scope:**
- Continue with the existing Supabase Postgres/Auth/Edge Functions and Paystack checkout integration; do not migrate to Neon.
- Dedicated checkout route/page and database-backed carts and wishlists for authenticated customers.
- Supabase Auth signup confirmation configured to use Mailgun SMTP and Google OAuth via Google Cloud Console credentials.
- Mailgun paid-order confirmation email sent server-side after payment verification with duplicate-send protection.
- Safe configuration, migrations, tests, user-facing error handling, deployment and provider setup documentation.

**Out of scope:**
- Creating or managing Google Cloud, Supabase, Mailgun, or Paystack credentials on the user's behalf.
- Sending real mail or completing live OAuth/payment validation without account access and configured provider secrets.
- Live Paystack payments, shipping integrations, or moving database/auth services to Neon.

## Applicable Project Conventions

**Quality gate command:**
- `npm run check` (syntax checks and Node.js built-in test suite). Use targeted Edge Function checks if Deno is available.

**Commit convention:**
- Existing conventional commit history; follow goal workflow role markers `[B]` and `[I]`.
- Builder trailer: `Assisted-by: OpenAI:GPT-5.6 Luna`; Inspector trailer: `Assisted-by: OpenAI:GPT-5.6 Sol`.
- Include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

**Guidelines:**
- No AGENTS.md, CONSTITUTION.md, `.agents/guidelines/`, or `.github/guidelines/` repository instructions were found.

**Rules:**
- Keep database writes and third-party secrets on trusted server-side functions; never trust client totals or client payment status.
- Use the configured Supabase project, existing commerce schema and Paystack test-mode backend. Preserve all pre-existing ignored/local secret files; do not inspect, stage, or expose secret values.
- Workspace was clean at discovery; current baseline is `85ac834`.
