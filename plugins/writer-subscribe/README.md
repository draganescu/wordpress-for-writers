# Writer Subscribe

Collects email subscribers and hands them over as a CSV. It doesn't send newsletters: export the list and import it into whatever email service you use.

It is a standalone plugin. It works with any theme, and adds a "Subscribers" link to the sidebar when WordPress for Writers is active.

## What it does

- **Scroll popup:** on posts, a small card (a bottom sheet on phones) appears once the reader is a set share of the way through the post body (60% by default). It is not shown to logged-in writers or to people who already subscribed in that browser. After it's closed, it stays hidden for a set number of days (14 by default).
- **Inline form:** the **Subscribe form** block or the `[writer_subscribe]` shortcode. Forms still work without JavaScript.
- **Double opt-in (on by default):** a confirmation email with a link. Confirm and unsubscribe links open a page with a button, so email scanners that open every link don't confirm or unsubscribe anyone. Confirmation links expire after 7 days and are single-use: confirming issues a fresh token for the unsubscribe link. Someone who unsubscribed is always asked to confirm again before they're re-added, even with double opt-in off, so a stranger can't re-subscribe them.
- **Abuse protection:** a honeypot field, a per-address limit (10 signups an hour, IPv6 bucketed by /64), a site-wide limit (60 a minute) and a 10-minute cooldown before a confirmation email is resent to the same address. The form gives the same answer for new and existing addresses, so it can't be used to find out who is on the list.
- **Admin screen:** counts by status, search, add an address by hand, delete.
- **CSV export:** streamed in batches of 5,000 straight to the download, so memory stays flat at any list size (500k rows ≈ 8 MB peak). The export respects the current status filter and search. Cells that start with a formula character are escaped so they can't run as formulas in a spreadsheet.
- **Privacy tools:** hooks into WordPress's personal data export and erasure.

Subscribers live in their own table, `{prefix}wsub_subscribers`, not in `wp_users`.

## Hooks

- `wsub_subscribed` / `wsub_unsubscribed`: actions, passed the subscriber row.
- `wsub_show_popup`: filter whether the popup appears on this request.
- `wsub_capability`: who can see and export the list (default `manage_options`).
- `wsub_signup_allowed`: return false to block a signup, e.g. after checking a CAPTCHA or Turnstile token you added to the form. Passed `$email` and `$source`.
- `wsub_rate_limit`: signups per address per hour (default 10).
- `wsub_global_rate_limit`: signups site-wide per minute (default 60).
- `wsub_client_ip`: the address used for rate limiting; set it from a proxy header if your host doesn't restore the client IP.
- `wsub_resend_cooldown`: seconds before a confirmation email is sent again to the same address (default 600).
- `wsub_confirm_ttl`: seconds a confirmation link stays valid (default 7 days).
- `wsub_export_batch_size`: rows per export batch (default 5000).
- `wsub_confirmation_subject` / `wsub_confirmation_body`: the confirmation email.

Uninstalling the plugin keeps the table, so a list is never lost by accident.
