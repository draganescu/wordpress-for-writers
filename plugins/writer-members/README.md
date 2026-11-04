# Writer Members

A deliberately small members system: a few tiers, a tier per member, a minimum tier per post, and a Paywall block that marks where non-members stop reading. Payments go through Stripe Payment Links and one webhook. There is no Stripe SDK, no checkout of its own and no member dashboard.

It is a standalone plugin and works with any theme. When WordPress for Writers is active, it adds a "Members" link to the sidebar and a **Visibility** picker to each note's settings (Cmd/Ctrl + Shift + ,).

## How it works

- **Tiers:** an ordered list (Free, Supporter, Founding by default) in the `wmem_tiers` option. Each has a name, a slug and an optional Stripe Payment Link. Order is rank: a post set to a tier can be read by that tier and every tier above it. The first tier is the free one, and any logged-in user without a tier reads at that level. Manage them under **Members → Tiers**. Slugs are fixed once saved.
- **Members:** ordinary WordPress users with their tier in the `wmem_tier` user meta. **Members → Members** lists them by tier, adds a member by email (creating the user if needed) and changes a member's tier. The tier is also on each user's profile screen.
- **Gating:** the `wmem_tier` post meta is the lowest tier that can read the whole post. Empty means everyone. It's registered with `show_in_rest`, so the Writer app (or anything else using the REST API) can set it. People who can edit the post always see all of it. A post set to a tier that was later removed stays closed to everyone but its editors.
- **Paywall block:** readers without access see the post up to the **Paywall** block, then an upgrade box. If a gated post has no Paywall block, they see the excerpt (the writer's own, or the first 55 words) and the box. Only a top-level Paywall block counts; one nested in a group falls back to the excerpt.
- **Upgrade box:** links to the tier's Payment Link with `client_reference_id` set to the tier slug, and `prefilled_email` when the reader is logged in. Logged-out readers also get a "Log in" link. The heading and text are in **Members → Settings**.

The cut is made on the block markup before it is rendered, so the hidden part never reaches the page. It goes through `the_content`, which covers the post page, the Post Content block, auto excerpts, the RSS/Atom feeds and the REST API's `content.rendered` / `excerpt.rendered`. Feeds always get the cut version, even for logged-in members, because feeds are shared and cached.

## Stripe

1. Create a Payment Link per paid tier in Stripe and paste each into **Members → Tiers**.
2. In Stripe, add a webhook endpoint for `/wp-json/writer-members/v1/stripe` (the full URL is shown under **Members → Settings**), sending `checkout.session.completed` and `customer.subscription.deleted`.
3. Paste the endpoint's signing secret (`whsec_…`) into **Members → Settings**.

The endpoint checks the `Stripe-Signature` header by hand (HMAC-SHA256 of `{timestamp}.{body}`, five-minute tolerance) and rejects anything else.

- `checkout.session.completed`: the tier comes from the session's `client_reference_id` (or `metadata.wmem_tier`), the email from `customer_details.email`. A user is created for a new email, with the subscriber role and the usual "set your password" email. The Stripe customer and subscription IDs are kept in user meta.
- `customer.subscription.deleted`: the member with that Stripe customer drops back to the first (free) tier.

## Page caching

A gated post looks different to members than to everyone else. For logged-in visitors on a gated post the plugin sends `nocache_headers()`. That's enough for caches that skip logged-in users (most WordPress page caches do, by looking for the `wordpress_logged_in_` cookie) or that follow `Cache-Control`. A cache that ignores both, such as a CDN set to cache everything, will serve one version to all readers: exclude gated posts from it, or have it bypass the cache when the login cookie is present. The logged-out version is the same for every logged-out reader and is safe to cache.

## Hooks

- `wmem_can_read`: filter whether a user can read a post in full (`$can, $post, $user_id`).
- `wmem_post_types`: post types that can be gated (default `post`).
- `wmem_upgrade_box`: filter the upgrade box HTML (`$html, $post, $tier`).
- `wmem_tier_changed`: action when a member's tier changes (`$user_id, $new, $old`).
- `wmem_stripe_event`: action after a verified webhook event (`$event, $result`).
- `wmem_capability`: who can manage tiers and members (default `manage_options`).

Uninstalling keeps tiers, member tiers and post settings.
