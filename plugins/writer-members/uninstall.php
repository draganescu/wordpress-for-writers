<?php
/**
 * Runs when Writer Members is deleted from the Plugins screen.
 *
 * Always removes the settings (they hold the Stripe signing secret) and the
 * webhook's event claims. Tiers, member tiers, Stripe IDs and post settings
 * are removed only when asked for, with "Delete … when the plugin is deleted"
 * under Members → Settings or with this in wp-config.php:
 *
 *     define( 'WMEM_DELETE_DATA_ON_UNINSTALL', true );
 *
 * On multisite this runs for every site in the network.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

function wmem_uninstall_site() {
    global $wpdb;

    $settings    = get_option( 'wmem_settings', array() );
    $delete_data = ( defined( 'WMEM_DELETE_DATA_ON_UNINSTALL' ) && WMEM_DELETE_DATA_ON_UNINSTALL )
        || ( is_array( $settings ) && ! empty( $settings['delete_data'] ) );

    delete_option( 'wmem_settings' );

    // phpcs:disable WordPress.DB.DirectDatabaseQuery
    // Event claims (wmem_evt_…), and transients from versions that used them.
    foreach ( array( 'wmem_evt_', '_transient_wmem_evt_', '_transient_timeout_wmem_evt_' ) as $prefix ) {
        $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like( $prefix ) . '%' ) );
    }

    if ( $delete_data ) {
        delete_option( 'wmem_tiers' );
        delete_option( 'wmem_db_version' );
        $prefix = $wpdb->get_blog_prefix();
        foreach ( array( 'wmem_tier', 'wmem_paid_tier', 'wmem_stripe_customer', 'wmem_stripe_subscription', 'wmem_stripe_payment_intent' ) as $key ) {
            $wpdb->delete( $wpdb->usermeta, array( 'meta_key' => $prefix . $key ) );
        }
        $wpdb->delete( $wpdb->postmeta, array( 'meta_key' => 'wmem_tier' ) );
    }
    // phpcs:enable

    return $delete_data;
}

if ( is_multisite() ) {
    $wmem_any_deleted = false;
    foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $wmem_site_id ) {
        switch_to_blog( $wmem_site_id );
        $wmem_any_deleted = wmem_uninstall_site() || $wmem_any_deleted;
        restore_current_blog();
    }
} else {
    $wmem_any_deleted = wmem_uninstall_site();
}

if ( $wmem_any_deleted ) {
    // Unprefixed, network-wide member keys from before member data was per site.
    global $wpdb;
    foreach ( array( 'wmem_tier', 'wmem_paid_tier', 'wmem_stripe_customer', 'wmem_stripe_subscription', 'wmem_stripe_payment_intent' ) as $wmem_key ) {
        $wpdb->delete( $wpdb->usermeta, array( 'meta_key' => $wmem_key ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
    }
}

wp_cache_flush();
