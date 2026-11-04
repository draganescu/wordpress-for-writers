<?php
/**
 * Removes what the plugin stored when it is deleted from the Plugins screen.
 *
 * Only each user's appearance preferences (the `wfw_appearance` user meta) are
 * removed. Posts, tags and categories written in the app are ordinary WordPress
 * content and stay. Site global styles set from the app's colour scheme are the
 * site's look, so they stay too.
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_metadata( 'user', 0, 'wfw_appearance', '', true );
