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

require_once __DIR__ . '/includes/tiers.php';
require_once __DIR__ . '/includes/settings.php';
require_once __DIR__ . '/includes/gate.php';
require_once __DIR__ . '/includes/stripe.php';
require_once __DIR__ . '/includes/admin.php';

/**
 * Cache-busting version for a plugin asset.
 */
function wmem_asset_version( $path ) {
    $file = __DIR__ . '/' . $path;
    return file_exists( $file ) ? WMEM_VERSION . '.' . filemtime( $file ) : WMEM_VERSION;
}
