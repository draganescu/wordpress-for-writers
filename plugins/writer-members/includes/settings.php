<?php
/**
 * Settings, stored in one option. Tiers have their own option (see tiers.php).
 */

defined( 'ABSPATH' ) || exit;

function wmem_defaults() {
    return array(
        'webhook_secret' => '',
        'delete_data'    => false,
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

    // The settings field is always blank (the secret isn't printed back), so
    // blank means "keep the saved one" unless removal was asked for.
    $secret = trim( sanitize_text_field( $input['webhook_secret'] ?? '' ) );
    if ( '' === $secret && empty( $input['webhook_secret_clear'] ) ) {
        $saved  = get_option( 'wmem_settings', array() );
        $secret = is_array( $saved ) ? (string) ( $saved['webhook_secret'] ?? '' ) : '';
    }

    return array(
        'webhook_secret' => $secret,
        'delete_data'    => ! empty( $input['delete_data'] ),
        'heading'        => sanitize_text_field( $input['heading'] ?? $d['heading'] ),
        'text'           => sanitize_textarea_field( $input['text'] ?? $d['text'] ),
    );
}

/**
 * wmem_settings holds the webhook signing secret: keep it out of the
 * autoloaded options that every request loads. Called on activation and
 * from the upgrade routine; updates keep the autoload flag.
 */
function wmem_settings_autoload_off() {
    if ( false === get_option( 'wmem_settings', false ) ) {
        add_option( 'wmem_settings', array(), '', false ); // Defaults fill in on read.
    } else {
        wp_set_option_autoload( 'wmem_settings', false );
    }
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
