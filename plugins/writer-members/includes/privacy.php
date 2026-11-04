<?php
/**
 * Personal data: export, erase, and the suggested privacy policy text.
 *
 * Covers what this plugin keeps about a member on the current site: their
 * tier, the tier Stripe sold them, and their Stripe customer, subscription
 * and payment intent IDs. Accounts themselves are core's to export and erase.
 */

defined( 'ABSPATH' ) || exit;

function wmem_privacy_fields() {
    return array(
        'wmem_tier'                  => __( 'Membership tier', 'writer-members' ),
        'wmem_paid_tier'             => __( 'Tier bought through Stripe', 'writer-members' ),
        'wmem_stripe_customer'       => __( 'Stripe customer ID', 'writer-members' ),
        'wmem_stripe_subscription'   => __( 'Stripe subscription ID', 'writer-members' ),
        'wmem_stripe_payment_intent' => __( 'Stripe payment intent ID', 'writer-members' ),
    );
}

add_filter( 'wp_privacy_personal_data_exporters', function ( $exporters ) {
    $exporters['writer-members'] = array(
        'exporter_friendly_name' => __( 'Writer Members', 'writer-members' ),
        'callback'               => 'wmem_privacy_export',
    );
    return $exporters;
} );

add_filter( 'wp_privacy_personal_data_erasers', function ( $erasers ) {
    $erasers['writer-members'] = array(
        'eraser_friendly_name' => __( 'Writer Members', 'writer-members' ),
        'callback'             => 'wmem_privacy_erase',
    );
    return $erasers;
} );

function wmem_privacy_export( $email, $page = 1 ) {
    $user = get_user_by( 'email', $email );
    $data = array();
    if ( $user ) {
        foreach ( wmem_privacy_fields() as $key => $label ) {
            $value = wmem_get_member_data( $user->ID, $key );
            if ( '' === $value ) {
                continue;
            }
            if ( in_array( $key, array( 'wmem_tier', 'wmem_paid_tier' ), true ) ) {
                $tier  = wmem_tier( $value );
                $value = $tier ? $tier['name'] . ' (' . $value . ')' : $value;
            }
            $data[] = array( 'name' => $label, 'value' => $value );
        }
    }
    $items = array();
    if ( $data ) {
        $items[] = array(
            'group_id'          => 'writer-members',
            'group_label'       => __( 'Membership', 'writer-members' ),
            'group_description' => __( 'Your membership tier and the Stripe IDs that link your account to your payments.', 'writer-members' ),
            'item_id'           => 'writer-members-' . $user->ID,
            'data'              => $data,
        );
    }
    return array( 'data' => $items, 'done' => true );
}

function wmem_privacy_erase( $email, $page = 1 ) {
    $user    = get_user_by( 'email', $email );
    $removed = false;
    $messages = array();
    if ( $user ) {
        foreach ( array_keys( wmem_privacy_fields() ) as $key ) {
            if ( '' !== wmem_get_member_data( $user->ID, $key ) ) {
                wmem_delete_member_data( $user->ID, $key );
                $removed = true;
            }
            // Network-wide values from before member data was per site.
            if ( '' !== (string) get_user_meta( $user->ID, $key, true ) ) {
                delete_user_meta( $user->ID, $key );
                $removed = true;
            }
        }
        if ( $removed ) {
            $messages[] = __( 'Writer Members: the membership tier and Stripe IDs were removed. Payment records held by Stripe have to be deleted in the Stripe dashboard.', 'writer-members' );
        }
    }
    return array(
        'items_removed'  => $removed,
        'items_retained' => false,
        'messages'       => $messages,
        'done'           => true,
    );
}

add_action( 'admin_init', function () {
    if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
        return;
    }
    $content  = '<p class="privacy-policy-tutorial">' . esc_html__( 'Writer Members stores a membership tier for each member and, for members who pay, IDs that link their account to their payment in Stripe.', 'writer-members' ) . '</p>';
    $content .= '<strong class="privacy-policy-tutorial">' . esc_html__( 'Suggested text:', 'writer-members' ) . ' </strong>';
    $content .= '<p>' . esc_html__( 'Paid memberships are processed by Stripe, Inc. When you buy a membership, you enter your payment details on a page run by Stripe, and Stripe processes them under its own privacy policy (https://stripe.com/privacy). We never see or store your card details.', 'writer-members' ) . '</p>';
    $content .= '<p>' . esc_html__( 'When a payment goes through, Stripe sends us your email address, and we create an account for it if you don’t have one. With your account we store your membership tier and the Stripe customer, subscription and payment IDs, so that renewals, cancellations, refunds and disputes update your access. We keep this for as long as you have an account. You can ask for an export or for it to be erased; records Stripe keeps about your payments stay with Stripe.', 'writer-members' ) . '</p>';
    wp_add_privacy_policy_content( __( 'Writer Members', 'writer-members' ), wp_kses_post( $content ) );
} );
