<?php
/**
 * Settings, stored in one option.
 */

defined( 'ABSPATH' ) || exit;

function wsub_defaults() {
    return array(
        'popup'         => true,
        'scroll'        => 60,
        'snooze_days'   => 14,
        'double_opt_in' => true,
        'heading'       => __( 'Enjoying this?', 'writer-subscribe' ),
        'text'          => __( 'Get new posts by email. No spam, unsubscribe any time.', 'writer-subscribe' ),
        'button'        => __( 'Subscribe', 'writer-subscribe' ),
        'consent'       => '',
    );
}

function wsub_settings() {
    $saved = get_option( 'wsub_settings', array() );
    return wp_parse_args( is_array( $saved ) ? $saved : array(), wsub_defaults() );
}

function wsub_setting( $key ) {
    $s = wsub_settings();
    return isset( $s[ $key ] ) ? $s[ $key ] : null;
}

function wsub_sanitize_settings( $input ) {
    $d = wsub_defaults();
    $input = is_array( $input ) ? $input : array();
    return array(
        'popup'         => ! empty( $input['popup'] ),
        'scroll'        => min( 100, max( 0, (int) ( $input['scroll'] ?? $d['scroll'] ) ) ),
        'snooze_days'   => min( 365, max( 0, (int) ( $input['snooze_days'] ?? $d['snooze_days'] ) ) ),
        'double_opt_in' => ! empty( $input['double_opt_in'] ),
        'heading'       => sanitize_text_field( $input['heading'] ?? $d['heading'] ),
        'text'          => sanitize_textarea_field( $input['text'] ?? $d['text'] ),
        'button'        => sanitize_text_field( $input['button'] ?? $d['button'] ),
        'consent'       => sanitize_text_field( $input['consent'] ?? '' ),
    );
}

add_action( 'admin_init', function () {
    register_setting(
        'wsub_settings',
        'wsub_settings',
        array( 'sanitize_callback' => 'wsub_sanitize_settings', 'default' => wsub_defaults() )
    );
} );

// options.php checks manage_options by default; match the screen's capability.
add_filter( 'option_page_capability_wsub_settings', 'wsub_capability' );
