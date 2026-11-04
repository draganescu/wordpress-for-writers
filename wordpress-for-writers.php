<?php
/**
 * Plugin Name: WordPress for Writers
 * Description: Replaces wp-admin with a three-pane, Bear-style writing interface: tags sidebar, note list, editor.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Author: Andrei Draganescu
 * License: GPL-2.0-or-later
 * Text Domain: wordpress-for-writers
 */

defined( 'ABSPATH' ) || exit;

define( 'WFW_VERSION', '0.1.0' );
define( 'WFW_URL', plugin_dir_url( __FILE__ ) );
define( 'WFW_PAGE', 'wfw' );

require_once __DIR__ . '/includes/appearance.php';
require_once __DIR__ . '/includes/thumbnails.php';

/**
 * Cache-busting version for a plugin asset.
 */
function wfw_asset_version( $path ) {
    $file = __DIR__ . '/' . $path;
    return file_exists( $file ) ? WFW_VERSION . '.' . filemtime( $file ) : WFW_VERSION;
}

/**
 * Whether the current request is the editor loaded inside the app's iframe.
 */
function wfw_is_frame() {
    return isset( $_GET['wfw_frame'] ); // phpcs:ignore WordPress.Security.NonceVerification
}

/**
 * Register the app page.
 */
add_action( 'admin_menu', function () {
    add_menu_page(
        __( 'Writer', 'wordpress-for-writers' ),
        __( 'Writer', 'wordpress-for-writers' ),
        'edit_posts',
        WFW_PAGE,
        'wfw_render_app',
        'dashicons-edit-page',
        1
    );
} );

function wfw_render_app() {
    echo '<div id="wfw-app" class="wfw"></div>';
}

/**
 * Send writers to the app instead of the dashboard.
 */
add_action( 'load-index.php', function () {
    if ( current_user_can( 'edit_posts' ) && ! isset( $_GET['wfw_classic'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
        wp_safe_redirect( admin_url( 'admin.php?page=' . WFW_PAGE ) );
        exit;
    }
} );

add_filter( 'login_redirect', function ( $redirect_to, $requested, $user ) {
    if ( $user instanceof WP_User && user_can( $user, 'edit_posts' ) && ( ! $requested || admin_url() === $requested ) ) {
        return admin_url( 'admin.php?page=' . WFW_PAGE );
    }
    return $redirect_to;
}, 10, 3 );

/**
 * The app page owns the whole viewport: no notices, full-screen body class.
 * Pending updates still surface, in the account menu (see `updatesCount`).
 */
add_action( 'load-toplevel_page_' . WFW_PAGE, function () {
    remove_all_actions( 'admin_notices' );
    remove_all_actions( 'all_admin_notices' );
    add_filter( 'admin_body_class', function ( $classes ) {
        return $classes . ' wfw-takeover';
    } );
    // Draw edge to edge (the app pads itself with the safe-area insets) and, where
    // supported (Chromium), shrink the layout when the on-screen keyboard opens.
    // maximum-scale stops iOS zooming in on fields with text under 16px; iOS still
    // allows pinch zoom regardless.
    add_filter( 'admin_viewport_meta', function () {
        return 'width=device-width,initial-scale=1.0,maximum-scale=1.0,viewport-fit=cover,interactive-widget=resizes-content';
    } );
} );

add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( 'toplevel_page_' . WFW_PAGE === $hook ) {
        wp_enqueue_style( 'wfw-app', WFW_URL . 'assets/app.css', array( 'wp-components' ), wfw_asset_version( 'assets/app.css' ) );
        wp_add_inline_style( 'wfw-app', wfw_appearance_css() );
        wp_enqueue_script( 'wfw-app', WFW_URL . 'assets/app.js', array( 'wp-api-fetch', 'wp-i18n', 'wp-element', 'wp-components', 'wp-data', 'wp-core-data', 'wp-media-utils' ), wfw_asset_version( 'assets/app.js' ), true );
        $user = wp_get_current_user();
        wp_localize_script( 'wfw-app', 'wfwSettings', array(
            'adminUrl'          => admin_url(),
            'siteUrl'           => home_url( '/' ),
            'siteName'          => get_bloginfo( 'name' ),
            'siteIcon'          => get_site_icon_url( 64 ),
            'userName'          => $user->display_name,
            // 48px for the 24px avatar on retina screens; empty when the site hides avatars.
            'avatarUrl'         => get_option( 'show_avatars' ) ? get_avatar_url( $user->ID, array( 'size' => 48 ) ) : '',
            'canManage'         => current_user_can( 'manage_options' ),
            'canDelete'         => current_user_can( 'delete_posts' ),
            'canUpload'         => current_user_can( 'upload_files' ),
            // The featured image panel follows the same checks as the editor's own control.
            'featuredImages'    => current_theme_supports( 'post-thumbnails', 'post' ) && post_type_supports( 'post', 'thumbnail' ),
            'maxUploadFileSize' => wp_max_upload_size(),
            'allowedMimeTypes'  => get_allowed_mime_types(),
            'logoutUrl'         => wp_logout_url(),
            // Core's update notices are hidden on the app page, so the account menu shows the
            // pending count instead, to the same people core shows it to (zero for everyone else).
            'updatesCount'      => current_user_can( 'update_core' ) || current_user_can( 'update_plugins' ) || current_user_can( 'update_themes' )
                ? (int) wp_get_update_data()['counts']['total']
                : 0,
            'appearance'        => wfw_appearance_client_data(),
            /**
             * Extra links for the sidebar's user menu, so companion plugins can
             * surface their screens. Each item: array( 'label' => '', 'url' => '', 'icon' => '' ).
             */
            'links'             => array_values( array_filter(
                (array) apply_filters( 'wfw_sidebar_links', array() ),
                function ( $link ) {
                    return is_array( $link ) && ! empty( $link['label'] ) && ! empty( $link['url'] );
                }
            ) ),
        ) );
        return;
    }

    if ( wfw_is_frame() && in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
        wp_enqueue_style( 'wfw-frame', WFW_URL . 'assets/frame.css', array(), wfw_asset_version( 'assets/frame.css' ) );
        wp_add_inline_style( 'wfw-frame', wfw_appearance_css() );
        wp_enqueue_script( 'wfw-frame', WFW_URL . 'assets/frame.js', array( 'wp-data', 'wp-editor', 'wp-edit-post', 'wp-i18n' ), wfw_asset_version( 'assets/frame.js' ), true );
        wp_localize_script( 'wfw-frame', 'wfwFrame', array(
            'appearance'     => wfw_get_appearance(),
            // Same checks as the app's featured image panel, which the link above the title opens.
            'featuredImages' => current_theme_supports( 'post-thumbnails', 'post' ) && post_type_supports( 'post', 'thumbnail' ),
        ) );
    }
} );

/**
 * Stamp appearance attributes on <html> before first paint, for the app and the embedded editor.
 */
add_action( 'admin_head', function () {
    $screen = get_current_screen();
    if ( ( $screen && 'toplevel_page_' . WFW_PAGE === $screen->id ) || wfw_is_frame() ) {
        echo '<script>' . wfw_appearance_bootstrap_script() . '</script>'; // phpcs:ignore WordPress.Security.EscapeOutput
    }
} );

/**
 * The editor canvas ignores the theme: drop theme and user global styles and the
 * theme's editor styles, keeping only presets so color/size classes still resolve.
 */
add_filter( 'block_editor_settings_all', function ( $settings ) {
    if ( ! wfw_is_frame() || empty( $settings['styles'] ) ) {
        return $settings;
    }
    $settings['styles'] = array_values( array_filter( $settings['styles'], function ( $style ) {
        return ! in_array( $style['__unstableType'] ?? '', array( 'theme', 'user' ), true );
    } ) );
    return $settings;
}, 99 );

/**
 * Our own default styling inside the canvas iframe. Assets enqueued on
 * enqueue_block_assets in the editor are loaded into the canvas unscoped.
 */
add_action( 'enqueue_block_assets', function () {
    if ( ! is_admin() || ! wfw_is_frame() ) {
        return;
    }

    // Drop theme stylesheets that would otherwise load into the canvas.
    $theme_urls = array_unique( array( get_stylesheet_directory_uri(), get_template_directory_uri() ) );
    foreach ( wp_styles()->queue as $handle ) {
        $src = wp_styles()->registered[ $handle ]->src ?? '';
        if ( 'wp-theme' === $handle || ( $src && array_filter( $theme_urls, fn( $url ) => str_starts_with( $src, $url ) ) ) ) {
            wp_dequeue_style( $handle );
        }
    }

    wp_enqueue_style( 'wfw-canvas', WFW_URL . 'assets/editor-content.css', array(), wfw_asset_version( 'assets/editor-content.css' ) );
    wp_add_inline_style( 'wfw-canvas', wfw_appearance_css() );
}, 99 );

/**
 * Keep the frame marker on the editor's body so its styles survive the editor rewriting the URL.
 */
add_filter( 'admin_body_class', function ( $classes ) {
    return wfw_is_frame() ? $classes . ' wfw-frame' : $classes;
} );

/**
 * Who else is editing a note, for the app's featured image panel, which saves
 * outside the editor. Same lock the editor's takeover dialog reads; empty when
 * the note is free or locked by the current user.
 */
add_action( 'rest_api_init', function () {
    register_rest_field( 'post', 'wfw_locked_by', array(
        'get_callback' => function ( $post ) {
            if ( ! current_user_can( 'edit_post', $post['id'] ) ) {
                return '';
            }
            require_once ABSPATH . 'wp-admin/includes/post.php';
            $user_id = wp_check_post_lock( $post['id'] );
            $user    = $user_id ? get_userdata( $user_id ) : null;
            return $user ? $user->display_name : '';
        },
        'schema'       => array(
            'description' => __( 'Display name of another user currently editing the post.', 'wordpress-for-writers' ),
            'type'        => 'string',
            'context'     => array( 'edit' ),
            'readonly'    => true,
        ),
    ) );
} );
