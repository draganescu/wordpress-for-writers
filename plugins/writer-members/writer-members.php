<?php
/**
 * Plugin Name: Writer Members
 * Description: Membership tiers, per-post gating with a paywall block, and a minimal Stripe webhook. Stands alone; pairs with WordPress for Writers.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: Andrei Draganescu
 * License: GPL-2.0-or-later
 * Text Domain: writer-members
 */

defined( 'ABSPATH' ) || exit;

define( 'WMEM_VERSION', '0.1.0' );
define( 'WMEM_FILE', __FILE__ );
define( 'WMEM_URL', plugin_dir_url( __FILE__ ) );
define( 'WMEM_DB_VERSION', 2 );

require_once __DIR__ . '/includes/tiers.php';
require_once __DIR__ . '/includes/settings.php';
require_once __DIR__ . '/includes/gate.php';
require_once __DIR__ . '/includes/stripe.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/privacy.php';

/**
 * One-time upgrades, run on the first request after an update (and on
 * activation), per site.
 *
 * 2: member data moves from network-wide user meta (wmem_tier, …) to
 *    blog-prefixed keys ({prefix}wmem_tier, …), and wmem_settings stops
 *    autoloading. On a single site the old keys are renamed in place. On
 *    multisite they can't be assigned to a site, so they are left alone and
 *    no longer read: set those members' tiers again on each site.
 */
function wmem_maybe_upgrade() {
    $version = (int) get_option( 'wmem_db_version', 0 );
    if ( $version >= WMEM_DB_VERSION ) {
        return;
    }
    global $wpdb;
    if ( $version < 2 ) {
        if ( ! is_multisite() ) {
            foreach ( wmem_member_keys() as $key ) {
                $new = wmem_meta_key( $key );
                // Rename only where the user has no prefixed value yet.
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery
                $wpdb->query(
                    $wpdb->prepare(
                        "UPDATE {$wpdb->usermeta} old LEFT JOIN {$wpdb->usermeta} cur ON cur.user_id = old.user_id AND cur.meta_key = %s SET old.meta_key = %s WHERE old.meta_key = %s AND cur.umeta_id IS NULL",
                        $new,
                        $new,
                        $key
                    )
                );
            }
            if ( wp_cache_supports( 'flush_group' ) ) {
                wp_cache_flush_group( 'user_meta' );
            } else {
                wp_cache_flush();
            }
        }
        wmem_settings_autoload_off();
    }
    update_option( 'wmem_db_version', WMEM_DB_VERSION );
}
add_action( 'init', 'wmem_maybe_upgrade', 0 );

register_activation_hook( __FILE__, function () {
    wmem_settings_autoload_off();
    wmem_maybe_upgrade();
} );

/**
 * Cache-busting version for a plugin asset.
 */
function wmem_asset_version( $path ) {
    $file = __DIR__ . '/' . $path;
    return file_exists( $file ) ? WMEM_VERSION . '.' . filemtime( $file ) : WMEM_VERSION;
}
