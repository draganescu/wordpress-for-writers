# Writer Members

A deliberately small members system: a few tiers, a tier per member, a minimum tier per post, and a Paywall block that marks where non-members stop reading. Payments go through Stripe Payment Links and one webhook. There is no Stripe SDK, no checkout of its own and no member dashboard.

It is a standalone plugin and works with any theme. When WordPress for Writers is active, it adds a "Members" link to the sidebar and a **Visibility** picker to each note's settings (Cmd/Ctrl + Shift + ,).

## How it works

- **Tiers:** an ordered list (Free, Supporter, Founding by default) in the `wmem_tiers` option. Each has a name, a slug and an optional Stripe Payment Link. Order is rank: a post set to a tier can be read by that tier and every tier above it. The first tier is the free one, and any logged-in user without a tier reads at that level. Manage them under **Members → Tiers**. Slugs are fixed once saved.
- **Members:** ordinary WordPress users with their tier in the `wmem_tier` user meta. **Members → Members** lists them by tier, adds a member by email (creating the user if needed) and changes a member's tier. The tier is also on each user's profile screen.
- **Gating:** the `wmem_tier` post meta is the lowest tier that can read the whole post. Empty means everyone. It's registered with `show_in_rest`, so the Writer app (or anything else using the REST API) can set it. People who can edit the post always see all of it. A post set to a tier that was later removed stays closed to everyone but its editors.
- **Paywall block:** readers without access see the post up to the **Paywall** block, then an upgrade box. If a gated post has no Paywall block, they see the excerpt (the writer's own, or the first 55 words) and the box. Only a top-level Paywall block counts; one nested in a group falls back to the excerpt.
- **Upgrade box:** links to the tier's Payment Link (with `prefilled_email` when the reader is logged in) and, for logged-out readers, to the login page. The heading and text are in **Members → Settings**.

The cut is made on the block markup before it is rendered, so the hidden part never reaches the page. Every way out is covered:

- `the_content` (priority 1, before `do_blocks`): the post page, the Post Content block, feeds, oEmbed and the REST API's `content.rendered`. Callers that pass a post ID instead of setting up the loop, like trackbacks, are covered too.
- `get_the_excerpt` (priority 9): excerpts of gated posts are the teaser, inside or outside the loop.
- REST `context=edit`: core gives `content.raw` and `excerpt.raw` for every post to anyone who can edit posts. For people who can't read a gated post in full, those are replaced with the locked version.
- The Latest Posts block's "full post" mode prints raw post content, so for readers who can't edit others' posts it shows excerpts instead.
- Search: for people who can't edit others' posts, gated posts match on title and excerpt only (site search, `/wp/v2/search`, `?search=`).
- Feeds always get the cut version, even for logged-in members, because feeds are shared and cached.
- Password-protected posts keep core's password form.

Who needs which tier is not a secret: `wmem_tier` post meta is readable in the REST API's view context, like any other `show_in_rest` meta.

## Stripe

1. Create a Payment Link per paid tier in Stripe. Paste its URL and its ID (`plink_…`) into **Members → Tiers**. The ID is how a payment is matched to a tier; payments for a link with no matching ID are ignored.
2. In Stripe, add a webhook endpoint for `/wp-json/writer-members/v1/stripe` (the full URL is shown under **Members → Settings**) with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
3. Paste the endpoint's signing secret (`whsec_…`) into **Members → Settings**.

The endpoint checks the `Stripe-Signature` header by hand (HMAC-SHA256 of `{timestamp}.{body}`, five-minute tolerance), rejects anything else, handles each event id once, and answers only `{"received":true}`.

- **Grant:** a Checkout Session with `payment_status` `paid` or `no_payment_required`, on `checkout.session.completed` or (for bank debits and transfers, which complete unpaid) `checkout.session.async_payment_succeeded`. The tier comes from the session's `payment_link`; Checkout Sessions created by your own code can set `metadata.wmem_tier` instead. Nothing the buyer can edit, like `client_reference_id`, is trusted. The email comes from `customer_details.email`; a new email gets a subscriber-role user and the usual "set your password" email.
- **The checkout email isn't verified,** so a payment can only ever raise a member's tier, never lower it. If the member already has a different Stripe customer on file, the payment doesn't replace it, so a stranger's later refund or cancellation can't touch them.
- **Revoke** (back to the first tier): `customer.subscription.deleted`, `customer.subscription.updated` to `past_due`, `unpaid`, `canceled`, `incomplete_expired` or `paused`, a full `charge.refunded`, and `charge.dispute.created`. Subscription events act only on the member whose stored subscription ID matches. A revoke only applies while the member still holds the tier Stripe gave them; a tier set by hand is left alone. A subscription that goes back to `active` gets its tier back.
- Disputes are matched by payment intent, which is stored for one-time payments. A dispute on a subscription invoice isn't matched; the subscription's own status change revokes access.

## Page caching

A gated post looks different to members than to everyone else. The plugin sends `nocache_headers()` on every front-end page for logged-in visitors, since lists and Query Loops can show gated content too. That's enough for caches that skip logged-in users (most WordPress page caches do, by looking for the `wordpress_logged_in_` cookie) or that follow `Cache-Control`. A cache that ignores both, such as a CDN set to cache everything, will serve one version to all readers: exclude gated posts from it, or have it bypass the cache when the login cookie is present. The logged-out version is the same for every logged-out reader and is safe to cache.

## Hooks

- `wmem_can_read`: filter whether a user can read a post in full (`$can, $post, $user_id`).
- `wmem_post_types`: post types that can be gated (default `post`).
- `wmem_upgrade_box`: filter the upgrade box HTML (`$html, $post, $tier`).
- `wmem_tier_changed`: action when a member's tier changes (`$user_id, $new, $old`).
- `wmem_stripe_event`: action after a verified webhook event (`$event, $result`).
- `wmem_capability`: who can manage tiers and members (default `manage_options`).

On multisite, a member's tier (`wmem_tier` user meta) is shared by every site in the network.

Uninstalling keeps tiers, member tiers and post settings.
