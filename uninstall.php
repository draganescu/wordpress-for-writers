<?php
/**
 * Removes what the plugin stored when it is deleted from the Plugins screen.
 *
 * Each user's app settings are removed: their appearance preferences (the
 * `wfw_appearance` user meta), the plugin blocks they turned off
 * (`wfw_hidden_blocks`), the style sheet they keep for agents
 * (`wfw_style_sheet`) and the categories and tags they pinned to the main menu
 * (`{site prefix}wfw_pinned_terms`, one key per site). Posts, tags and
 * categories written in the app are ordinary WordPress content and stay. Site
 * global styles set from the app's colour scheme are the site's look, so they
 * stay too.
 *
 * Of the agent surface (spec/agent/surface.md), every suggestion goes: each
 * comment that has the `_wfw_kind` meta, with its meta, and the
 * `wfw_agent_seen` option. Asks and other core notes are the site's and stay.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_metadata( 'user', 0, 'wfw_appearance', '', true );
delete_metadata( 'user', 0, 'wfw_hidden_blocks', '', true );
delete_metadata( 'user', 0, 'wfw_style_sheet', '', true );

// The pins' key carries each site's table prefix, like a user option (see includes/pinned-terms.php).
global $wpdb;
$wfw_site_ids = is_multisite() ? get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) : array( get_current_blog_id() );
foreach ( $wfw_site_ids as $wfw_site_id ) {
    delete_metadata( 'user', 0, $wpdb->get_blog_prefix( $wfw_site_id ) . 'wfw_pinned_terms', '', true );

    // Suggestions and the option are each site's own.
    if ( is_multisite() ) {
        switch_to_blog( $wfw_site_id );
    }
    $wfw_suggestion_ids = get_comments( array(
        'type'     => 'note',
        'status'   => 'any',
        'fields'   => 'ids',
        'meta_key' => '_wfw_kind', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key -- once, when the plugin is deleted.
    ) );
    foreach ( $wfw_suggestion_ids as $wfw_suggestion_id ) {
        wp_delete_comment( $wfw_suggestion_id, true );
    }
    delete_option( 'wfw_agent_seen' );
    if ( is_multisite() ) {
        restore_current_blog();
    }
}
