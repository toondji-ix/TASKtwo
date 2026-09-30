# Atelier June — accessories storefront

A responsive boutique storefront prototype for a curated edit of bags, jewelry, and sunglasses. It runs as a static client-side app with a tiny Node.js file server and has no runtime dependencies.

## Requirements

- Node.js 18 or newer
- npm (included with Node.js)

## Install and run

From the project folder:

```sh
npm install
npm run start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). To choose another port, set `PORT` before `npm run start` (for example, PowerShell: `$env:PORT=5000; npm run start`).

`npm install` only initializes the local npm project; the storefront has no third-party package dependencies. Alternatively, start it with `node server.js`.

## Test and checks

```sh
npm test
npm run check
```

The Node.js built-in test runner covers catalog categories, cart and wishlist persistence, demo account access, checkout validation and order creation, shipping totals, and order lookup. `npm run check` also runs Node's syntax checks on the application and server.

## Shopping and demo flows

- Browse or filter all eight curated products, search by name/category/color, save favorites, and adjust the shopping bag.
- The cart, wishlist, demo account, and placed orders are stored in this browser's `localStorage`. Cart contents and favorites are restored after reload.
- In **Account**, create a demo profile using a name and email, or access an existing local demo profile by email. There is no password, identity verification, account backend, or secure authentication.
- At checkout, provide the required name, email, delivery address, city, postal code, and country. A reference is generated for the simulated order and can be entered in **Order tracking** or found in the account.
- Delivery is shown as complimentary for carts of $100 or more and otherwise costs $8. All delivery progress is illustrative; no carrier or shipment is involved.

This is a frontend demonstration only. No payment details are requested or processed; no real order, identity, payment, inventory, or shipping services are connected.
