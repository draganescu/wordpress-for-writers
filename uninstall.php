<?php
/**
 * Removes what the plugin stored when it is deleted from the Plugins screen.
 *
 * Only each user's app settings are removed: their appearance preferences (the
 * `wfw_appearance` user meta) and the categories and tags they pinned to the
 * main menu (`{site prefix}wfw_pinned_terms`, one key per site). Posts, tags
 * and categories written in the app are ordinary WordPress content and stay.
 * Site global styles set from the app's colour scheme are the site's look, so
 * they stay too.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_metadata( 'user', 0, 'wfw_appearance', '', true );

// The pins' key carries each site's table prefix, like a user option (see includes/pinned-terms.php).
global $wpdb;
$wfw_site_ids = is_multisite() ? get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) : array( get_current_blog_id() );
foreach ( $wfw_site_ids as $wfw_site_id ) {
    delete_metadata( 'user', 0, $wpdb->get_blog_prefix( $wfw_site_id ) . 'wfw_pinned_terms', '', true );
}
