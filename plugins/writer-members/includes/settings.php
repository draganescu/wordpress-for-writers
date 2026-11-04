<?php
/**
 * Settings, stored in one option. Tiers have their own option (see tiers.php).
 */

defined( 'ABSPATH' ) || exit;

function wmem_defaults() {
    return array(
        'webhook_secret' => '',
        'heading'        => __( 'This post is for %s members', 'writer-members' ),
        'text'           => __( 'Become a member to read the rest and support the writing.', 'writer-members' ),
    );
}

function wmem_settings() {
    $saved = get_option( 'wmem_settings', array() );
    return wp_parse_args( is_array( $saved ) ? $saved : array(), wmem_defaults() );
}

function wmem_setting( $key ) {
    $s = wmem_settings();
    return isset( $s[ $key ] ) ? $s[ $key ] : null;
}

function wmem_sanitize_settings( $input ) {
    $d     = wmem_defaults();
    $input = is_array( $input ) ? $input : array();
    return array(
        'webhook_secret' => trim( sanitize_text_field( $input['webhook_secret'] ?? '' ) ),
        'heading'        => sanitize_text_field( $input['heading'] ?? $d['heading'] ),
        'text'           => sanitize_textarea_field( $input['text'] ?? $d['text'] ),
    );
}

add_action( 'admin_init', function () {
    register_setting(
        'wmem_settings',
        'wmem_settings',
        array( 'sanitize_callback' => 'wmem_sanitize_settings', 'default' => wmem_defaults() )
    );
    register_setting(
        'wmem_tiers',
        'wmem_tiers',
        array( 'sanitize_callback' => 'wmem_sanitize_tiers', 'default' => wmem_default_tiers() )
    );
} );
