# Goal: Build a fashion accessories storefront

## User Request

Build an ecommerce store for a fashion accessories business. Customer can add product to cart, wishlist, checkout, track goods, and create account.

## Refined Goal

Build a polished, responsive storefront for a modern boutique selling bags, jewelry, and sunglasses. Customers can browse products, manage a browser-persisted cart and wishlist, create a demo account, complete a simulated checkout, and view tracking progress for placed orders. This is a frontend prototype; customer and order state may be simulated locally and must not imply real payment processing, shipping, or production-grade authentication.

## Acceptance Criteria

- [ ] The app starts using documented project commands and presents a cohesive, responsive fashion accessories storefront with bags, jewelry, and sunglasses.
- [ ] Customers can browse products and add/remove products to/from the cart and wishlist; cart and wishlist state survive a page reload.
- [ ] Customers can create and access a demo account through a usable account flow, without claiming production-grade authentication.
- [ ] Checkout validates required customer/delivery details, completes a simulated purchase, and exposes the resulting order to the customer.
- [ ] Customers can look up a placed order and see its simulated delivery/tracking status.
- [ ] Relevant automated checks pass, and the primary shopping, account, checkout, and tracking flows are verified in a browser at desktop and mobile widths.

## Scope Boundaries

**In scope:**
- A complete client-side storefront experience for a boutique accessories catalog.
- Responsive product discovery, cart, wishlist, demo account, simulated checkout, and order tracking.
- Browser persistence for cart, wishlist, and demo order/account state where appropriate.
- Project setup, documentation, and fit-for-purpose automated checks for this initially empty workspace.

**Out of scope:**
- Real payment processing, shipment booking/carrier integrations, inventory services, or production backend.
- Production-grade identity verification, authentication, or secure handling of payment credentials.
- Admin/catalog management and deployment to a public hosting provider.

## Applicable Project Conventions

**Quality gate command:**
- No project or quality-gate command existed at discovery. Establish and document the project's install/run and test/build commands, then run the relevant checks.

**Commit convention:**
- No project-specific convention exists; use conventional commits with the goal workflow's `[B]` / `[I]` role markers.
- Include `Assisted-by: OpenAI:GPT-5.6 Luna` for Builder commits and `Assisted-by: OpenAI:GPT-5.6 Sol` for Inspector commits.
- Also include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` on commits.

**Guidelines:**
- No AGENTS.md, CONSTITUTION.md, or applicable guideline files existed at discovery.

**Rules:**
- Keep this prototype self-contained and clear that payment, identity, and delivery are simulated.
- The workspace was empty; the user approved building from scratch and initializing Git.
