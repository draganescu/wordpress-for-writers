<?php
/**
 * Plugin Name: WordPress for Writers
 * Description: Replaces wp-admin with a three-pane, Bear-style writing interface: tags sidebar, note list, editor.
 * Version: 0.4.0
 * Requires at least: 7.1
 * Requires PHP: 7.4
 * Author: Andrei Draganescu
 * Update URI: https://github.com/draganescu/wordpress-for-writers
 * License: GPL-2.0-or-later
 * Text Domain: wordpress-for-writers
 */

defined( 'ABSPATH' ) || exit;

/*
 * The editor is built from parts that arrived in WordPress 7.1 (ThemeProvider,
 * the public editor components, FormTokenField's help prop). WordPress
 * refuses to activate the plugin below the header's version; this covers a
 * site that was downgraded afterwards, which gets a notice instead of a
 * broken editor.
 */
if ( version_compare( $GLOBALS['wp_version'], '7.1', '<' ) ) {
    add_action( 'admin_notices', function () {
        printf(
            '<div class="notice notice-error"><p>%s</p></div>',
            esc_html__( 'WordPress for Writers needs WordPress 7.1 or newer. Update WordPress to use it.', 'wordpress-for-writers' )
        );
    } );
    return;
}

define( 'WFW_VERSION', '0.4.0' );
define( 'WFW_URL', plugin_dir_url( __FILE__ ) );
define( 'WFW_PAGE', 'wfw' );

require_once __DIR__ . '/includes/pinned-terms.php';
require_once __DIR__ . '/includes/appearance.php';
require_once __DIR__ . '/includes/thumbnails.php';
require_once __DIR__ . '/includes/site-scheme.php';
require_once __DIR__ . '/includes/editor.php';

/**
 * Cache-busting version for a plugin asset.
 */
function wfw_asset_version( $path ) {
    $file = __DIR__ . '/' . $path;
    return file_exists( $file ) ? WFW_VERSION . '.' . filemtime( $file ) : WFW_VERSION;
}

/**
 * Who can read a note, for the Visibility picker in the note's settings.
 * Companion plugins (Writer Members) fill `wfw_visibility_options` with
 * array( 'value' => '', 'label' => '' ) items; with none, there is no picker.
 * The choice is saved to the post meta named by `wfw_visibility_meta_key`,
 * which must be registered with show_in_rest. "Everyone" (an empty value)
 * is always offered first.
 */
function wfw_visibility() {
    $options = array_values( array_filter(
        (array) apply_filters( 'wfw_visibility_options', array() ),
        function ( $option ) {
            return is_array( $option ) && isset( $option['value'], $option['label'] ) && '' !== (string) $option['value'];
        }
    ) );
    if ( ! $options ) {
        return null;
    }
    return array(
        'metaKey' => (string) apply_filters( 'wfw_visibility_meta_key', 'wmem_tier' ),
        'options' => $options,
    );
}

/**
 * Who gets Writer: the app, the takeover of the dashboard and the editor.
 * By default it's everyone who can write posts: Contributors, Authors,
 * Editors and Administrators (edit_posts). Filter `wfw_capability` to
 * narrow it down, for example to edit_pages for Editors and up. Everyone else
 * keeps the standard dashboard, and opening Writer explains why.
 */
function wfw_capability() {
    return (string) apply_filters( 'wfw_capability', 'edit_posts' );
}

function wfw_user_can_write( $user = null ) {
    return $user ? user_can( $user, wfw_capability() ) : current_user_can( wfw_capability() );
}

/**
 * Register the app page: in the menu for those who can use Writer, and as a
 * hidden page for everyone else, so its URL shows the explanation rather
 * than WordPress's bare "not allowed" screen.
 */
add_action( 'admin_menu', function () {
    if ( wfw_user_can_write() ) {
        add_menu_page(
            __( 'Writer', 'wordpress-for-writers' ),
            __( 'Writer', 'wordpress-for-writers' ),
            wfw_capability(),
            WFW_PAGE,
            'wfw_render_app',
            'dashicons-edit-page',
            1
        );
        return;
    }
    add_submenu_page( '', __( 'Writer', 'wordpress-for-writers' ), '', 'read', WFW_PAGE, 'wfw_render_no_access' );
} );

// A page without a menu entry gets no title from the menu; give the explanation one.
add_action( 'load-admin_page_' . WFW_PAGE, function () {
    $GLOBALS['title'] = __( 'Writer', 'wordpress-for-writers' ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride
} );

function wfw_render_app() {
    echo '<div id="wfw-app" class="wfw"></div>';
}

/**
 * Why Writer isn't open to this user, and where to go instead.
 */
function wfw_render_no_access() {
    $user  = wp_get_current_user();
    $names = wp_roles()->role_names;
    $roles = array_filter( array_map( function ( $role ) use ( $names ) {
        return isset( $names[ $role ] ) ? translate_user_role( $names[ $role ] ) : '';
    }, (array) $user->roles ) );
    ?>
    <div class="wrap">
        <h1><?php esc_html_e( 'Writer', 'wordpress-for-writers' ); ?></h1>
        <div class="card" style="max-width: 560px;">
            <h2 class="title"><?php esc_html_e( 'Writer is for the people who write on this site', 'wordpress-for-writers' ); ?></h2>
            <p>
                <?php
                if ( 'edit_posts' === wfw_capability() ) {
                    esc_html_e( 'Writer, this site’s writing app, is open to everyone who can write posts here: Contributors, Authors, Editors and Administrators.', 'wordpress-for-writers' );
                } else {
                    esc_html_e( 'Writer, this site’s writing app, is open to people with the permissions this site has set for it.', 'wordpress-for-writers' );
                }
                ?>
            </p>
            <p>
                <?php
                $role = $roles ? '<strong>' . esc_html( implode( ', ', $roles ) ) . '</strong>' : '';
                if ( current_user_can( 'edit_posts' ) ) {
                    // The site narrowed Writer down: this user writes, just not in Writer.
                    echo $role // phpcs:ignore WordPress.Security.EscapeOutput
                        /* translators: %s: the user's role(s), such as "Author". */
                        ? sprintf( esc_html__( 'Your account is set up as %s, so you’ll keep using the standard WordPress dashboard, where you can still write and manage your posts.', 'wordpress-for-writers' ), $role ) // phpcs:ignore WordPress.Security.EscapeOutput
                        : esc_html__( 'You’ll keep using the standard WordPress dashboard, where you can still write and manage your posts.', 'wordpress-for-writers' );
                } else {
                    echo $role // phpcs:ignore WordPress.Security.EscapeOutput
                        /* translators: %s: the user's role(s), such as "Subscriber". */
                        ? sprintf( esc_html__( 'Your account is set up as %s, which is for reading the site and managing your profile rather than writing posts.', 'wordpress-for-writers' ), $role ) // phpcs:ignore WordPress.Security.EscapeOutput
                        : esc_html__( 'Your account is for reading the site and managing your profile rather than writing posts.', 'wordpress-for-writers' );
                }
                ?>
            </p>
            <p><?php esc_html_e( 'If you think you should be writing here, ask one of the site’s administrators.', 'wordpress-for-writers' ); ?></p>
            <p>
                <?php if ( current_user_can( 'edit_posts' ) ) : ?>
                    <a class="button button-primary" href="<?php echo esc_url( admin_url( 'edit.php' ) ); ?>"><?php esc_html_e( 'Go to your posts', 'wordpress-for-writers' ); ?></a>
                <?php endif; ?>
                <a class="button" href="<?php echo esc_url( admin_url( current_user_can( 'edit_posts' ) ? 'index.php' : 'profile.php' ) ); ?>"><?php echo current_user_can( 'edit_posts' ) ? esc_html__( 'Dashboard', 'wordpress-for-writers' ) : esc_html__( 'Your profile', 'wordpress-for-writers' ); ?></a>
            </p>
        </div>
    </div>
    <?php
}

/**
 * Send writers to the app instead of the dashboard.
 */
add_action( 'load-index.php', function () {
    if ( wfw_user_can_write() && ! isset( $_GET['wfw_classic'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
        wp_safe_redirect( admin_url( 'admin.php?page=' . WFW_PAGE ) );
        exit;
    }
} );

add_filter( 'login_redirect', function ( $redirect_to, $requested, $user ) {
    if ( $user instanceof WP_User && wfw_user_can_write( $user ) && ( ! $requested || admin_url() === $requested ) ) {
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
            // The app's preferences in the browser (open tabs, view) are kept per user.
            'userId'            => $user->ID,
            // 48px for the 24px avatar on retina screens; empty when the site hides avatars.
            'avatarUrl'         => get_option( 'show_avatars' ) ? get_avatar_url( $user->ID, array( 'size' => 48 ) ) : '',
            'canManage'         => current_user_can( 'manage_options' ),
            'canDelete'         => current_user_can( 'delete_posts' ),
            'canUpload'         => current_user_can( 'upload_files' ),
            // The featured image panel follows the same checks as the editor's own control.
            'featuredImages'    => current_theme_supports( 'post-thumbnails', 'post' ) && post_type_supports( 'post', 'thumbnail' ),
            // The categories and tags form: which taxonomies the note has, and who may add new terms to them.
            'terms'             => wfw_terms_settings(),
            // The visibility meta a companion plugin gates notes with (null without one), so
            // a duplicate keeps the original's visibility.
            'visibility'        => wfw_visibility(),
            'maxUploadFileSize' => wp_max_upload_size(),
            'allowedMimeTypes'  => get_allowed_mime_types(),
            'logoutUrl'         => wp_logout_url(),
            // The Writer editor's page; each tab loads it for its note (see includes/editor.php).
            'editorUrl'         => wfw_editor_url(),
            // Core's update notices are hidden on the app page, so the account menu shows the
            // pending count instead, to the same people core shows it to (zero for everyone else).
            'updatesCount'      => current_user_can( 'update_core' ) || current_user_can( 'update_plugins' ) || current_user_can( 'update_themes' )
                ? (int) wp_get_update_data()['counts']['total']
                : 0,
            'appearance'        => wfw_appearance_client_data(),
            // Categories and tags pinned to the main menu, and the user meta key that stores them.
            'pinnedTerms'       => wfw_pinned_terms_client_data(),
            'pinnedTermsKey'    => wfw_pinned_terms_key(),
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
    }
} );

/**
 * What the app's categories and tags form may do: which of the two taxonomies
 * notes have, and whether the user may add new terms to each. The REST API lets
 * anyone who can assign tags make new ones, while new categories take the
 * taxonomy's edit_terms capability (manage_categories, by default).
 */
function wfw_terms_settings() {
    $category = get_taxonomy( 'category' );
    $tag      = get_taxonomy( 'post_tag' );
    return array(
        'categories'       => is_object_in_taxonomy( 'post', 'category' ),
        'tags'             => is_object_in_taxonomy( 'post', 'post_tag' ),
        'canAddCategories' => $category && current_user_can( $category->cap->edit_terms ),
        'canAddTags'       => $tag && current_user_can( $tag->cap->assign_terms ),
    );
}

/**
 * Stamp appearance attributes on <html> before first paint. The editor page does its own (includes/editor.php).
 */
add_action( 'admin_head-toplevel_page_' . WFW_PAGE, function () {
    echo '<script>' . wfw_appearance_bootstrap_script() . '</script>'; // phpcs:ignore WordPress.Security.EscapeOutput
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
