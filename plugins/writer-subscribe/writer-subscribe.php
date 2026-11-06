<?php
/**
 * Plugin Name: Writer Subscribe
 * Description: Collect email subscribers with a scroll-triggered popup and an inline form, then export them as CSV. Stands alone; pairs with WordPress for Writers.
 * Version: 0.1.1
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: Andrei Draganescu
 * License: GPL-2.0-or-later
 * Text Domain: writer-subscribe
 * Update URI: https://github.com/draganescu/wordpress-for-writers
 */

defined( 'ABSPATH' ) || exit;

define( 'WSUB_VERSION', '0.1.1' );
define( 'WSUB_DB_VERSION', '3' );
define( 'WSUB_FILE', __FILE__ );
define( 'WSUB_URL', plugin_dir_url( __FILE__ ) );

require_once __DIR__ . '/includes/store.php';
require_once __DIR__ . '/includes/settings.php';
require_once __DIR__ . '/includes/public.php';
require_once __DIR__ . '/includes/admin.php';
require_once __DIR__ . '/includes/privacy.php';

register_activation_hook( __FILE__, 'wsub_activate' );
register_deactivation_hook( __FILE__, 'wsub_deactivate' );
add_action( 'plugins_loaded', 'wsub_maybe_upgrade' );

/**
 * Cache-busting version for a plugin asset.
 */
function wsub_asset_version( $path ) {
    $file = __DIR__ . '/' . $path;
    return file_exists( $file ) ? WSUB_VERSION . '.' . filemtime( $file ) : WSUB_VERSION;
}
