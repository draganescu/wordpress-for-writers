<?php
/**
 * The Writer app as an installable web app: a manifest, home screen icons and
 * the tags iOS reads, so "Add to Home Screen" (or Install in Chromium) gives
 * the app its own icon and a window without the browser's chrome.
 *
 * There is no service worker: the app needs the site to load notes and save
 * them, and wp-admin pages are not something to serve from a cache.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The editor background of the user's theme, for the splash screen and the
 * browser chrome. System follows the device, so it has a light and a dark one.
 *
 * @return array{light: string, dark: string}
 */
function wfw_pwa_colors() {
    $themes = wfw_themes();
    $theme  = wfw_get_appearance()['theme'] ?? 'system';
    if ( isset( $themes[ $theme ] ) ) {
        $bg = $themes[ $theme ]['colors']['bg'];
        return array( 'light' => $bg, 'dark' => $bg );
    }
    return array(
        'light' => $themes['red-graphite']['colors']['bg'],
        'dark'  => $themes['charcoal']['colors']['bg'],
    );
}

/**
 * The site's own icon when it has one, else the app's.
 */
function wfw_pwa_icon_url( $size ) {
    $site_icon = get_site_icon_url( $size );
    return $site_icon ? $site_icon : WFW_URL . 'assets/icons/icon-' . $size . '.png';
}

/**
 * The manifest is fetched without cookies, so it's public and knows nothing of
 * the user: the app page passes the user's background colour along in its URL.
 */
add_action( 'rest_api_init', function () {
    register_rest_route( 'wfw/v1', '/manifest', array(
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'args'                => array(
            'bg' => array(
                'type'    => 'string',
                'pattern' => '^[0-9a-fA-F]{6}$',
            ),
        ),
        'callback'            => function ( WP_REST_Request $request ) {
            $name  = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
            $name  = '' !== $name ? $name : __( 'Writer', 'wordpress-for-writers' );
            $bg    = $request['bg'] ? '#' . strtolower( $request['bg'] ) : '#ffffff';
            $start = admin_url( 'admin.php?page=' . WFW_PAGE );
            $icons = array();
            foreach ( array( 192, 512 ) as $size ) {
                $icons[] = array(
                    'src'     => wfw_pwa_icon_url( $size ),
                    'sizes'   => $size . 'x' . $size,
                    'type'    => 'image/png',
                    'purpose' => 'any',
                );
            }
            $response = new WP_REST_Response( array(
                'id'               => $start,
                'name'             => $name,
                'short_name'       => mb_strlen( $name ) <= 12 ? $name : __( 'Writer', 'wordpress-for-writers' ),
                'description'      => __( 'Write and publish to your site.', 'wordpress-for-writers' ),
                'start_url'        => $start,
                // The whole site, so signing in (wp-login.php) and the public posts stay in the app's window.
                'scope'            => home_url( '/' ),
                'display'          => 'standalone',
                'background_color' => $bg,
                'theme_color'      => $bg,
                'icons'            => $icons,
            ) );
            $response->header( 'Content-Type', 'application/manifest+json; charset=' . get_option( 'blog_charset' ) );
            return $response;
        },
    ) );
} );

/**
 * The app page's tags for installing it. The status bar stays opaque, in the
 * theme's colour: the app starts below it, as it does in the browser. (iOS
 * reads this when the app is added to the Home Screen, not at each launch.)
 */
add_action( 'admin_head-toplevel_page_' . WFW_PAGE, function () {
    $colors   = wfw_pwa_colors();
    $manifest = add_query_arg( 'bg', ltrim( $colors['light'], '#' ), rest_url( 'wfw/v1/manifest' ) );
    $name     = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
    $title    = '' !== $name && mb_strlen( $name ) <= 12 ? $name : __( 'Writer', 'wordpress-for-writers' );

    printf( '<link rel="manifest" href="%s">' . "\n", esc_url( $manifest ) );
    echo '<meta name="mobile-web-app-capable" content="yes">' . "\n";
    echo '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n";
    echo '<meta name="apple-mobile-web-app-status-bar-style" content="default">' . "\n";
    printf( '<meta name="apple-mobile-web-app-title" content="%s">' . "\n", esc_attr( $title ) );
    printf( '<link rel="apple-touch-icon" href="%s">' . "\n", esc_url( wfw_pwa_icon_url( 180 ) ) );
    if ( $colors['light'] === $colors['dark'] ) {
        printf( '<meta name="theme-color" content="%s">' . "\n", esc_attr( $colors['light'] ) );
    } else {
        printf( '<meta name="theme-color" media="(prefers-color-scheme: light)" content="%s">' . "\n", esc_attr( $colors['light'] ) );
        printf( '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="%s">' . "\n", esc_attr( $colors['dark'] ) );
    }
} );
