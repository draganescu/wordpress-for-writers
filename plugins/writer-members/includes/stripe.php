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
    $secret  = (string) wmem_setting( 'webhook_secret' );

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

    // Stripe retries and a signed body can be replayed within the tolerance: handle each event once.
    $seen_key = '';
    if ( ! empty( $event['id'] ) && is_string( $event['id'] ) ) {
        $seen_key = 'wmem_evt_' . md5( $event['id'] );
        if ( get_transient( $seen_key ) ) {
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

    if ( $seen_key ) {
        set_transient( $seen_key, 1, DAY_IN_SECONDS );
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

    $user_id = wmem_find_or_create_member( $email );
    if ( is_wp_error( $user_id ) ) {
        return array( 'error' => $user_id->get_error_message() );
    }

    $customer = is_string( $session['customer'] ?? null ) ? sanitize_text_field( $session['customer'] ) : '';
    $stored   = (string) get_user_meta( $user_id, 'wmem_stripe_customer', true );

    // The checkout email isn't verified, so someone else can pay "as" a member.
    // That may only ever raise their tier, never lower it, and it must not take
    // over their Stripe records (which is what refunds and cancellations act on).
    if ( '' !== $stored && $stored !== $customer ) {
        if ( wmem_tier_rank( $tier['slug'] ) > wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
            wmem_set_user_tier( $user_id, $tier['slug'] );
        }
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ), 'note' => 'other customer' );
    }

    // A purchase below the member's current tier changes nothing, Stripe
    // records included: it may not even be theirs.
    if ( wmem_tier_rank( $tier['slug'] ) < wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ), 'note' => 'lower tier' );
    }
    wmem_set_user_tier( $user_id, $tier['slug'] );
    update_user_meta( $user_id, 'wmem_paid_tier', $tier['slug'] );
    if ( '' !== $customer ) {
        update_user_meta( $user_id, 'wmem_stripe_customer', $customer );
    }
    foreach ( array( 'subscription' => 'wmem_stripe_subscription', 'payment_intent' => 'wmem_stripe_payment_intent' ) as $field => $meta ) {
        if ( is_string( $session[ $field ] ?? null ) && '' !== $session[ $field ] ) {
            update_user_meta( $user_id, $meta, sanitize_text_field( $session[ $field ] ) );
        }
    }
    return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ) );
}

function wmem_stripe_user_by( $meta_key, $value ) {
    $value = is_string( $value ) ? sanitize_text_field( $value ) : '';
    if ( '' === $value ) {
        return 0;
    }
    $users = get_users( array( 'meta_key' => $meta_key, 'meta_value' => $value, 'number' => 1, 'fields' => 'ID' ) );
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
    $paid = (string) get_user_meta( $user_id, 'wmem_paid_tier', true );
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
        delete_user_meta( $user_id, 'wmem_stripe_subscription' );
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
        $paid = (string) get_user_meta( $user_id, 'wmem_paid_tier', true );
        if ( wmem_tier( $paid ) && wmem_tier_rank( $paid ) > wmem_tier_rank( wmem_user_tier( $user_id ) ) ) {
            wmem_set_user_tier( $user_id, $paid );
        }
        return array( 'user' => $user_id, 'tier' => wmem_user_tier( $user_id ) );
    }
    return array( 'ignored' => 'status ' . $status );
}

/**
 * The user with this email, or a new subscriber-role user who gets the
 * usual "set your password" email.
 */
function wmem_find_or_create_member( $email ) {
    $user = get_user_by( 'email', $email );
    if ( $user ) {
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
        wp_new_user_notification( $user_id, null, 'user' );
    }
    return $user_id;
}
