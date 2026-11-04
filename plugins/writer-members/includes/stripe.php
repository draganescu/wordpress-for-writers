<?php
/**
 * Minimal Stripe webhook: POST /wp-json/writer-members/v1/stripe
 *
 * - checkout.session.completed: give the buyer the tier named in the
 *   session's client_reference_id (the upgrade box adds it to the Payment
 *   Link), creating a user for their email if needed.
 * - customer.subscription.deleted: drop that customer back to the lowest tier.
 *
 * No Stripe SDK: the Stripe-Signature header is checked by hand.
 */

defined( 'ABSPATH' ) || exit;

function wmem_webhook_url() {
    return rest_url( 'writer-members/v1/stripe' );
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
    if ( ! is_array( $event ) || empty( $event['type'] ) ) {
        return new WP_Error( 'wmem_bad_payload', 'Invalid payload.', array( 'status' => 400 ) );
    }
    $object = $event['data']['object'] ?? array();

    switch ( $event['type'] ) {
        case 'checkout.session.completed':
            $result = wmem_stripe_checkout_completed( $object );
            break;
        case 'customer.subscription.deleted':
            $result = wmem_stripe_subscription_deleted( $object );
            break;
        default:
            $result = array( 'ignored' => $event['type'] );
    }

    do_action( 'wmem_stripe_event', $event, $result );
    return rest_ensure_response( array( 'received' => true ) + $result );
}

function wmem_stripe_checkout_completed( $session ) {
    $email = sanitize_email( $session['customer_details']['email'] ?? ( $session['customer_email'] ?? '' ) );
    $slug  = sanitize_key( $session['client_reference_id'] ?? ( $session['metadata']['wmem_tier'] ?? '' ) );
    $tier  = wmem_tier( $slug );

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
    wmem_set_user_tier( $user_id, $tier['slug'] );

    if ( ! empty( $session['customer'] ) && is_string( $session['customer'] ) ) {
        update_user_meta( $user_id, 'wmem_stripe_customer', sanitize_text_field( $session['customer'] ) );
    }
    if ( ! empty( $session['subscription'] ) && is_string( $session['subscription'] ) ) {
        update_user_meta( $user_id, 'wmem_stripe_subscription', sanitize_text_field( $session['subscription'] ) );
    }
    return array( 'user' => $user_id, 'tier' => $tier['slug'] );
}

function wmem_stripe_subscription_deleted( $subscription ) {
    $customer = sanitize_text_field( (string) ( $subscription['customer'] ?? '' ) );
    if ( '' === $customer ) {
        return array( 'ignored' => 'no customer' );
    }
    $users = get_users( array( 'meta_key' => 'wmem_stripe_customer', 'meta_value' => $customer, 'number' => 1, 'fields' => 'ID' ) );
    if ( ! $users ) {
        return array( 'ignored' => 'unknown customer' );
    }
    $user_id = (int) $users[0];
    $tiers   = wmem_tiers();
    $lowest  = $tiers ? $tiers[0]['slug'] : '';
    wmem_set_user_tier( $user_id, $lowest );
    delete_user_meta( $user_id, 'wmem_stripe_subscription' );
    return array( 'user' => $user_id, 'tier' => $lowest );
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
