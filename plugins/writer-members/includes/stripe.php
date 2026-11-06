<?php
/**
 * Minimal Stripe webhook: POST /wp-json/writer-members/v1/stripe
 *
 * Grants:
 * - checkout.session.completed with payment_status paid / no_payment_required
 * - checkout.session.async_payment_succeeded (bank debits and transfers)
 *
 * The tier comes from the session's payment_link, matched against the
 * Payment Link ID stored on each tier (or, for Checkout Sessions created by
 * other code, the session's metadata.wmem_tier). Nothing the buyer can edit,
 * such as client_reference_id or URL parameters, decides the tier.
 *
 * Revokes (back to the lowest tier, only if the tier still is the one Stripe granted):
 * - customer.subscription.deleted
 * - customer.subscription.updated to past_due, unpaid, canceled, incomplete_expired or paused
 * - charge.refunded (full refunds)
 * - charge.dispute.created
 *
 * No Stripe SDK: the Stripe-Signature header is checked by hand.
 */

defined( 'ABSPATH' ) || exit;

function wmem_webhook_url() {
    return rest_url( 'writer-members/v1/stripe' );
}

/**
 * Events to send to the endpoint, shown on the settings screen.
 */
function wmem_stripe_events() {
    return array(
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'charge.refunded',
        'charge.dispute.created',
    );
}

add_action( 'rest_api_init', function () {
    register_rest_route(
        'writer-members/v1',
        '/stripe',
        array(
            'methods'             => 'POST',
            'callback'            => 'wmem_stripe_webhook',
            'permission_callback' => '__return_true', // Authenticated by signature.
        )
    );
} );

/**
 * The endpoint's signing secret. WMEM_STRIPE_WEBHOOK_SECRET in wp-config.php
 * wins over the one saved in Members → Settings.
 */
function wmem_webhook_secret_from_constant() {
    return defined( 'WMEM_STRIPE_WEBHOOK_SECRET' ) && is_string( WMEM_STRIPE_WEBHOOK_SECRET ) && '' !== trim( WMEM_STRIPE_WEBHOOK_SECRET );
}

function wmem_webhook_secret() {
    if ( wmem_webhook_secret_from_constant() ) {
        return trim( WMEM_STRIPE_WEBHOOK_SECRET );
    }
    return (string) wmem_setting( 'webhook_secret' );
}

/*
 * Event claims. Each event id gets a row in the options table (wmem_evt_…,
 * not autoloaded), inserted with INSERT IGNORE so the unique option_name
 * makes the claim atomic: of two concurrent deliveries only one inserts the
 * row and goes on to grant. The value is "p:{time}" while processing and
 * "d:{time}" when done. A claim stuck in processing for five minutes (the
 * request died) can be taken over. Rows older than a day are cleaned up.
 */
function wmem_stripe_claim_event( $event_id ) {
    global $wpdb;
    $name = 'wmem_evt_' . md5( $event_id );
    $now  = time();
    // phpcs:disable WordPress.DB.DirectDatabaseQuery
    $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND CAST( SUBSTRING( option_value, 3 ) AS UNSIGNED ) < %d",
            $wpdb->esc_like( 'wmem_evt_' ) . '%',
            $now - DAY_IN_SECONDS
        )
    );
    $inserted = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} ( option_name, option_value, autoload ) VALUES ( %s, %s, 'no' )", $name, 'p:' . $now ) );
    if ( 1 === $inserted ) {
        return $name;
    }
    $current = (string) $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $name ) );
    if ( 0 === strpos( $current, 'p:' ) && (int) substr( $current, 2 ) < $now - 300 ) {
        // Compare-and-swap, so only one retry takes over a stuck claim.
        $taken = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND option_value = %s", 'p:' . $now, $name, $current ) );
        if ( 1 === $taken ) {
            return $name;
        }
    }
    // phpcs:enable
    return '';
}

function wmem_stripe_finish_event( $name ) {
    global $wpdb;
    $wpdb->update( $wpdb->options, array( 'option_value' => 'd:' . time() ), array( 'option_name' => $name ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
}

function wmem_stripe_release_event( $name ) {
    global $wpdb;
    $wpdb->delete( $wpdb->options, array( 'option_name' => $name ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
}

/**
 * Check a Stripe-Signature header ("t=…,v1=…[,v1=…]") against the raw body.
 * The signed payload is "{t}.{body}", HMAC-SHA256 with the endpoint secret.
 */
function wmem_stripe_verify( $payload, $header, $secret, $tolerance = 300 ) {
    if ( '' === $secret || '' === $header ) {
        return false;
    }
    $timestamp  = 0;
    $signatures = array();
    foreach ( explode( ',', $header ) as $part ) {
        $pair = explode( '=', trim( $part ), 2 );
        if ( 2 !== count( $pair ) ) {
            continue;
        }
        if ( 't' === $pair[0] ) {
            $timestamp = (int) $pair[1];
        } elseif ( 'v1' === $pair[0] ) {
            $signatures[] = $pair[1];
        }
    }
    if ( ! $timestamp || ! $signatures || abs( time() - $timestamp ) > $tolerance ) {
        return false;
    }
    $expected = hash_hmac( 'sha256', $timestamp . '.' . $payload, $secret );
    foreach ( $signatures as $signature ) {
        if ( hash_equals( $expected, $signature ) ) {
            return true;
        }
    }
    return false;
}

function wmem_stripe_webhook( WP_REST_Request $request ) {
    $payload = $request->get_body();
    $secret  = wmem_webhook_secret();

    if ( '' === $secret ) {
        return new WP_Error( 'wmem_no_secret', 'Webhook secret is not set.', array( 'status' => 503 ) );
    }
    if ( ! wmem_stripe_verify( $payload, (string) $request->get_header( 'stripe_signature' ), $secret ) ) {
        return new WP_Error( 'wmem_bad_signature', 'Invalid signature.', array( 'status' => 400 ) );
    }

    $event = json_decode( $payload, true );
    if ( ! is_array( $event ) || empty( $event['type'] ) || ! isset( $event['data']['object'] ) || ! is_array( $event['data']['object'] ) ) {
        return new WP_Error( 'wmem_bad_payload', 'Invalid payload.', array( 'status' => 400 ) );
    }

    // Stripe retries, may deliver an event twice at once, and a signed body can
    // be replayed within the tolerance: claim the event id before acting on it.
    $claim = '';
    if ( ! empty( $event['id'] ) && is_string( $event['id'] ) ) {
        $claim = wmem_stripe_claim_event( $event['id'] );
        if ( '' === $claim ) {
            return rest_ensure_response( array( 'received' => true ) );
        }
    }

    $object = $event['data']['object'];
    switch ( $event['type'] ) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
            $result = wmem_stripe_checkout_paid( $object );
            break;
        case 'customer.subscription.deleted':
            $result = wmem_stripe_subscription_ended( $object );
            break;
        case 'customer.subscription.updated':
            $result = wmem_stripe_subscription_updated( $object );
            break;
        case 'charge.refunded':
            $result = empty( $object['refunded'] )
                ? array( 'ignored' => 'partial refund' )
                : wmem_stripe_revoke( wmem_stripe_user_by( 'wmem_stripe_customer', $object['customer'] ?? '' ), 'refund' );
            break;
        case 'charge.dispute.created':
            $result = wmem_stripe_revoke( wmem_stripe_user_by( 'wmem_stripe_payment_intent', $object['payment_intent'] ?? '' ), 'dispute' );
            break;
        default:
            $result = array( 'ignored' => 'event type' );
    }

    if ( $claim ) {
        if ( isset( $result['error'] ) ) {
            wmem_stripe_release_event( $claim ); // Let a resend from Stripe try again.
        } else {
            wmem_stripe_finish_event( $claim );
        }
    }

    /**
     * Fires after a verified webhook event, with what was done about it.
     */
    do_action( 'wmem_stripe_event', $event, $result );

    // Stripe only needs to know it arrived; keep user ids and errors out of its logs.
    return rest_ensure_response( array( 'received' => true ) );
}

/**
 * The tier a paid Checkout Session buys, from data the buyer can't change.
 */
function wmem_stripe_session_tier( $session ) {
    $plink = is_string( $session['payment_link'] ?? null ) ? $session['payment_link'] : '';
    if ( '' !== $plink ) {
        foreach ( wmem_tiers() as $tier ) {
            if ( ! empty( $tier['plink'] ) && hash_equals( $tier['plink'], $plink ) ) {
                return $tier;
            }
        }
        return null; // A Payment Link we don't know: don't guess.
    }
    $slug = is_string( $session['metadata']['wmem_tier'] ?? null ) ? sanitize_key( $session['metadata']['wmem_tier'] ) : '';
    return '' !== $slug ? wmem_tier( $slug ) : null;
}

function wmem_stripe_checkout_paid( $session ) {
    if ( ! in_array( $session['payment_status'] ?? '', array( 'paid', 'no_payment_required' ), true ) ) {
        // Delayed methods complete unpaid; checkout.session.async_payment_succeeded grants later.
        return array( 'ignored' => 'not paid' );
    }
    $email = sanitize_email( $session['customer_details']['email'] ?? ( $session['customer_email'] ?? '' ) );
    $tier  = wmem_stripe_session_tier( $session );
    if ( ! is_email( $email ) ) {
        return array( 'ignored' => 'no email' );
    }
    if ( ! $tier ) {
        return array( 'ignored' => 'unknown tier' );
    }

    $created = false;
    $user_id = wmem_find_or_create_member( $email, $created );
    if ( is_wp_error( $user_id ) ) {
        return array( 'error' => $user_id->get_error_message() );
    }

    $ids = array();
    foreach ( array( 'customer', 'subscription', 'payment_intent' ) as $field ) {
        $ids[ $field ] = is_string( $session[ $field ] ?? null ) ? sanitize_text_field( $session[ $field ] ) : '';
    }
    $customer = $ids['customer'];
    $stored   = (string) wmem_get_member_data( $user_id, 'wmem_stripe_customer' );

    // The checkout email isn't verified, so someone else can pay "as" a member.
    // That may only ever raise their tier, never lower it, and it must not put
    // the payer's Stripe records on the account: refunds, disputes and
    // cancellations act on those records, so storing them would let the payer
    // revoke a tier the member didn't get from them. Records are stored only
    // on an account this webhook just created for the email, or one that
    // already carries the session's customer.
    $linked = $created || ( '' !== $customer && $stored === $customer );
    if ( ! $linked ) {
        if ( wmem_tier_rank( $tier['slug'] ) > wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
            wmem_set_user_tier( $user_id, $tier['slug'] );
        }
        $note = '' !== $stored ? 'other customer' : 'unlinked customer';
        if ( '' === $stored ) {
            // Nothing on file means a later cancellation will match no one:
            // tell the admin, who can refund it or lower the tier by hand.
            wmem_stripe_notify_unlinked( $user_id, $tier, $ids );
        }
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ), 'note' => $note, 'stripe' => $ids );
    }

    // A purchase below the member's current tier changes nothing, Stripe
    // records included: it may not even be theirs.
    if ( wmem_tier_rank( $tier['slug'] ) < wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ), 'note' => 'lower tier' );
    }
    wmem_set_user_tier( $user_id, $tier['slug'] );
    wmem_update_member_data( $user_id, 'wmem_paid_tier', $tier['slug'] );
    foreach ( array( 'customer' => 'wmem_stripe_customer', 'subscription' => 'wmem_stripe_subscription', 'payment_intent' => 'wmem_stripe_payment_intent' ) as $field => $meta ) {
        if ( '' !== $ids[ $field ] ) {
            wmem_update_member_data( $user_id, $meta, $ids[ $field ] );
        }
    }
    return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ) );
}

/**
 * Email the admin about a payment made with the email of an existing account
 * that has no Stripe customer on file. The payment isn't linked to the
 * account (see wmem_stripe_checkout_paid), so no later Stripe event will find
 * the member; the admin has to act on it by hand.
 */
function wmem_stripe_notify_unlinked( $user_id, $tier, $ids ) {
    $user = get_userdata( $user_id );
    if ( ! $user ) {
        return;
    }
    $site    = wp_specialchars_decode( get_option( 'blogname' ), ENT_QUOTES );
    $subject = sprintf(
        /* translators: %s: site name */
        __( '[%s] Stripe payment not linked to a member', 'writer-members' ),
        $site
    );
    $message = sprintf(
        /* translators: 1: tier name, 2: email address, 3: user ID */
        __( 'A Stripe payment for the tier "%1$s" was made with the email %2$s, which belongs to an existing account (user ID %3$d) that has no Stripe customer on file. Because the checkout email isn\'t verified, the payment wasn\'t linked to that account: the tier was raised if it was lower, but a later refund, dispute or cancellation of this payment won\'t change the member\'s tier. If the payment is the member\'s own, lower their tier by hand when it ends; if it isn\'t, refund it in Stripe and set their tier back.', 'writer-members' ),
        $tier['name'],
        $user->user_email,
        $user_id
    ) . "\n\n";
    foreach ( array( 'customer' => __( 'Stripe customer', 'writer-members' ), 'subscription' => __( 'Subscription', 'writer-members' ), 'payment_intent' => __( 'Payment intent', 'writer-members' ) ) as $field => $label ) {
        if ( '' !== $ids[ $field ] ) {
            $message .= $label . ': ' . $ids[ $field ] . "\n";
        }
    }
    $message .= __( 'Members', 'writer-members' ) . ': ' . wmem_admin_url() . "\n";
    wp_mail( get_option( 'admin_email' ), $subject, $message );
}

/**
 * The member whose stored Stripe ID ($meta_key, unprefixed) is $value.
 *
 * Scale: this is a meta_value lookup, which the usermeta table doesn't index
 * (only meta_key is), so MySQL scans every row for that key. That's fine for
 * a writer's list of a few thousand members and runs once per webhook. Past
 * tens of thousands, keep a lookup table keyed by Stripe ID instead.
 */
function wmem_stripe_user_by( $meta_key, $value ) {
    $value = is_string( $value ) ? sanitize_text_field( $value ) : '';
    if ( '' === $value ) {
        return 0;
    }
    $users = get_users(
        array(
            'blog_id'    => 0, // The key is already per site; don't also require site membership.
            'meta_key'   => wmem_meta_key( $meta_key ),
            'meta_value' => $value,
            'number'     => 1,
            'fields'     => 'ID',
        )
    );
    return $users ? (int) $users[0] : 0;
}

/**
 * Drop a member to the lowest tier, but only if they still hold the tier
 * Stripe gave them: a tier an admin set by hand is left alone.
 */
function wmem_stripe_revoke( $user_id, $reason ) {
    if ( ! $user_id ) {
        return array( 'ignored' => 'unknown member' );
    }
    $paid = (string) wmem_get_member_data( $user_id, 'wmem_paid_tier' );
    if ( '' === $paid || wmem_user_tier( $user_id ) !== $paid ) {
        return array( 'ignored' => 'tier not from Stripe', 'user' => $user_id );
    }
    $tiers  = wmem_tiers();
    $lowest = $tiers ? $tiers[0]['slug'] : '';
    wmem_set_user_tier( $user_id, $lowest );
    return array( 'user' => $user_id, 'tier' => $lowest, 'reason' => $reason );
}

/**
 * Subscription events act only on the member whose stored subscription this
 * is, so a stranger's subscription can never touch them.
 */
function wmem_stripe_subscription_member( $subscription ) {
    return wmem_stripe_user_by( 'wmem_stripe_subscription', $subscription['id'] ?? '' );
}

function wmem_stripe_subscription_ended( $subscription ) {
    $user_id = wmem_stripe_subscription_member( $subscription );
    $result  = wmem_stripe_revoke( $user_id, 'subscription ended' );
    if ( $user_id ) {
        wmem_delete_member_data( $user_id, 'wmem_stripe_subscription' );
    }
    return $result;
}

function wmem_stripe_subscription_updated( $subscription ) {
    $user_id = wmem_stripe_subscription_member( $subscription );
    if ( ! $user_id ) {
        return array( 'ignored' => 'unknown subscription' );
    }
    $status = $subscription['status'] ?? '';
    if ( in_array( $status, array( 'past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused' ), true ) ) {
        return wmem_stripe_revoke( $user_id, 'subscription ' . $status );
    }
    if ( in_array( $status, array( 'active', 'trialing' ), true ) ) {
        // Back in good standing: restore the tier it paid for, if that's higher.
        $paid = (string) wmem_get_member_data( $user_id, 'wmem_paid_tier' );
        if ( wmem_tier( $paid ) && wmem_tier_rank( $paid ) > wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
            wmem_set_user_tier( $user_id, $paid );
        }
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ) );
    }
    return array( 'ignored' => 'status ' . $status );
}

/**
 * The user with this email, or a new subscriber-role user who gets the
 * usual "set your password" email. $created says which it was.
 */
function wmem_find_or_create_member( $email, &$created = null ) {
    $created = false;
    $user    = get_user_by( 'email', $email );
    if ( $user ) {
        // On multisite the account may belong to another site: add it here,
        // so the member shows up among this site's users.
        if ( is_multisite() && ! is_user_member_of_blog( $user->ID ) ) {
            add_user_to_blog( get_current_blog_id(), $user->ID, 'subscriber' );
        }
        return $user->ID;
    }
    $base  = sanitize_user( strstr( $email, '@', true ), true );
    $base  = $base ? $base : 'member';
    $login = $base;
    $n     = 2;
    while ( username_exists( $login ) ) {
        $login = $base . $n++;
    }
    $user_id = wp_insert_user(
        array(
            'user_login' => $login,
            'user_email' => $email,
            'user_pass'  => wp_generate_password( 24 ),
            'role'       => 'subscriber',
        )
    );
    if ( ! is_wp_error( $user_id ) ) {
        $created = true;
        wp_new_user_notification( $user_id, null, 'user' );
    }
    return $user_id;
}
