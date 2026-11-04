<?php
/**
 * Runs when the plugin is deleted from the Plugins screen. Removes the
 * subscriber table, settings, rate-limit counters and the scheduled purge,
 * on every site of a multisite network.
 *
 * Export the list first if you want to keep it: this cannot be undone.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

function wsub_uninstall_site() {
    global $wpdb;

    $table = $wpdb->prefix . 'wsub_subscribers';
    $wpdb->query( "DROP TABLE IF EXISTS `{$table}`" ); // phpcs:ignore WordPress.DB.PreparedSQL,WordPress.DB.DirectDatabaseQuery.SchemaChange

    delete_option( 'wsub_settings' );
    delete_option( 'wsub_db_version' );

    // Rate-limit counters. With a persistent object cache they don't live in
    // the options table and expire on their own within the hour.
    delete_transient( 'wsub_rl_all' );
    $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
            $wpdb->esc_like( '_transient_wsub_rl_' ) . '%',
            $wpdb->esc_like( '_transient_timeout_wsub_rl_' ) . '%'
        )
    );

    wp_clear_scheduled_hook( 'wsub_purge' );
}

if ( is_multisite() ) {
    foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $wsub_site_id ) {
        switch_to_blog( $wsub_site_id );
        wsub_uninstall_site();
        restore_current_blog();
    }
} else {
    wsub_uninstall_site();
}
