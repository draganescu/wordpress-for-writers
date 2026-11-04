<?php
/**
 * Site colour scheme sync.
 *
 * When someone who can edit the site's appearance picks a colour scheme in the
 * Writer app, the active theme switches to the matching style variation, so the
 * public site looks like the editor. Only themes that opt in are touched:
 *
 *     add_theme_support( 'wfw-color-schemes' );
 *
 * Such a theme ships one style variation per scheme, named after the scheme's
 * slug (styles/red-graphite.json, styles/system.json, …). The three themes in
 * themes/ do this.
 *
 * Only the variation's colours are written into the site's global styles
 * (palette, `custom` values and its CSS, kept between markers); fonts, spacing
 * and other changes made in the Site Editor are left alone. Turn the sync off
 * with `add_filter( 'wfw_sync_site_color_scheme', '__return_false' );`.
 */

defined( 'ABSPATH' ) || exit;

const WFW_SCHEME_CSS_START = '/* wfw-color-scheme */';
const WFW_SCHEME_CSS_END   = '/* /wfw-color-scheme */';

/**
 * Whether the active theme takes Writer colour schemes, and sync is on.
 */
function wfw_site_scheme_enabled() {
    return current_theme_supports( 'wfw-color-schemes' )
        && wp_is_block_theme()
        && (bool) apply_filters( 'wfw_sync_site_color_scheme', true );
}

/**
 * The active theme's style variation for a scheme, or null if it has none.
 *
 * @param string $scheme Scheme slug, e.g. "nord".
 * @return array|null
 */
function wfw_site_scheme_variation( $scheme ) {
    if ( ! preg_match( '/^[a-z0-9-]+$/', $scheme ) ) {
        return null;
    }
    $file = get_theme_file_path( 'styles/' . $scheme . '.json' );
    if ( ! is_readable( $file ) ) {
        return null;
    }
    $data = json_decode( (string) file_get_contents( $file ), true );
    return is_array( $data ) ? $data : null;
}

/**
 * Write a scheme's colours into the active theme's user global styles.
 *
 * @param string $scheme Scheme slug.
 * @return bool Whether the global styles were changed.
 */
function wfw_apply_site_scheme( $scheme ) {
    if ( ! wfw_site_scheme_enabled() || ! class_exists( 'WP_Theme_JSON_Resolver' ) ) {
        return false;
    }
    $variation = wfw_site_scheme_variation( $scheme );
    if ( ! $variation ) {
        return false;
    }

    $stylesheet = get_stylesheet();
    $post_id = WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
    if ( ! $post_id ) {
        return false;
    }
    // The post must be tied to the theme, or WordPress won't find it again.
    if ( ! has_term( $stylesheet, 'wp_theme', $post_id ) ) {
        wp_set_object_terms( $post_id, $stylesheet, 'wp_theme' );
    }

    $before = (string) get_post_field( 'post_content', $post_id );
    $data   = json_decode( $before, true );
    $data   = is_array( $data ) ? $data : array();

    // Colours: the variation's palette replaces the theme-origin palette.
    $palette = $variation['settings']['color']['palette'] ?? null;
    if ( is_array( $palette ) ) {
        $data['settings']['color']['palette']['theme'] = $palette;
    } else {
        unset( $data['settings']['color']['palette']['theme'] );
    }

    // Custom values (error colour, hero panel): replace whatever the last scheme set.
    $custom = $variation['settings']['custom'] ?? array();
    $data['settings']['custom'] = array_merge(
        array_diff_key( $data['settings']['custom'] ?? array(), array_flip( array( 'error', 'hero' ) ) ),
        $custom
    );
    if ( empty( $data['settings']['custom'] ) ) {
        unset( $data['settings']['custom'] );
    }

    // CSS: keep the site's own custom CSS, swap only the scheme's block.
    $css = (string) ( $data['styles']['css'] ?? '' );
    $css = trim( preg_replace( '#' . preg_quote( WFW_SCHEME_CSS_START, '#' ) . '.*?' . preg_quote( WFW_SCHEME_CSS_END, '#' ) . '#s', '', $css ) );
    if ( ! empty( $variation['styles']['css'] ) ) {
        $css = trim( $css . "\n" . WFW_SCHEME_CSS_START . $variation['styles']['css'] . WFW_SCHEME_CSS_END );
    }
    if ( '' === $css ) {
        unset( $data['styles']['css'] );
    } else {
        $data['styles']['css'] = $css;
    }
    if ( empty( $data['styles'] ) ) {
        unset( $data['styles'] );
    }

    $data['version']                     = WP_Theme_JSON::LATEST_SCHEMA;
    $data['isGlobalStylesUserThemeJSON'] = true;

    $content = wp_json_encode( $data );
    if ( $content === $before ) {
        return false;
    }

    $result = wp_update_post(
        array(
            'ID'           => $post_id,
            'post_content' => wp_slash( $content ),
        ),
        true
    );
    if ( is_wp_error( $result ) ) {
        return false;
    }
    if ( function_exists( 'wp_clean_theme_json_cache' ) ) {
        wp_clean_theme_json_cache();
    }
    return true;
}

/**
 * Sync when the current user saves a new scheme in the Writer app.
 */
function wfw_site_scheme_on_meta( $meta_id, $user_id, $meta_key, $value ) {
    if ( 'wfw_appearance' !== $meta_key || (int) $user_id !== get_current_user_id() ) {
        return;
    }
    if ( ! user_can( $user_id, 'edit_theme_options' ) ) {
        return;
    }
    $appearance = wfw_sanitize_appearance( $value );
    wfw_apply_site_scheme( $appearance['theme'] );
}
add_action( 'added_user_meta', 'wfw_site_scheme_on_meta', 10, 4 );
add_action( 'updated_user_meta', 'wfw_site_scheme_on_meta', 10, 4 );

/**
 * When a theme that takes schemes is activated, give it the current user's scheme.
 */
function wfw_site_scheme_on_switch() {
    if ( current_user_can( 'edit_theme_options' ) ) {
        wfw_apply_site_scheme( wfw_get_appearance()['theme'] );
    }
}
add_action( 'after_switch_theme', 'wfw_site_scheme_on_switch' );
