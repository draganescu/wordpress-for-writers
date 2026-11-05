<?php
/**
 * The Writer editor: a note's editor page, loaded in an iframe per tab.
 *
 * Built from the block editor's public parts (EditorProvider, BlockCanvas,
 * BlockToolbar, PostTitle, PostPublishButton and friends, see editor.js) on a
 * page of our own, instead of reshaping wp-admin's post editor. The page is a
 * hidden admin page printed with iframe_header() / iframe_footer(), so it has
 * no admin menu or toolbar to hide. The server side mirrors what
 * wp-admin/edit-form-blocks.php sets up, through the same public functions:
 * the post lock, REST preloading, block definitions, editor settings and the
 * assets blocks need.
 */

defined( 'ABSPATH' ) || exit;

define( 'WFW_EDITOR_PAGE', 'wfw-editor' );

/**
 * The editor page's URL for a note, or for a new note without an id.
 */
function wfw_editor_url( $post_id = 0 ) {
    $args = array( 'page' => WFW_EDITOR_PAGE );
    if ( $post_id ) {
        $args['post'] = (int) $post_id;
    }
    return add_query_arg( $args, admin_url( 'admin.php' ) );
}

/**
 * Register the page without a menu entry (an empty parent hides it).
 */
add_action( 'admin_menu', function () {
    add_submenu_page( '', __( 'Editor', 'wordpress-for-writers' ), '', 'edit_posts', WFW_EDITOR_PAGE, '__return_null' );
} );

/**
 * Print the editor page and stop, before wp-admin draws its own chrome.
 */
add_action( 'load-admin_page_' . WFW_EDITOR_PAGE, function () {
    require_once ABSPATH . 'wp-admin/includes/post.php';

    $post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
    if ( $post_id ) {
        $post = get_post( $post_id );
        if ( ! $post || 'post' !== $post->post_type ) {
            wp_die( esc_html__( 'This note no longer exists.', 'wordpress-for-writers' ), 404 );
        }
        if ( ! current_user_can( 'edit_post', $post->ID ) ) {
            wp_die( esc_html__( 'Sorry, you are not allowed to edit this note.', 'wordpress-for-writers' ), 403 );
        }
        if ( 'trash' === $post->post_status ) {
            wp_die( esc_html__( 'This note is in the Trash. Restore it to edit it.', 'wordpress-for-writers' ) );
        }
    } else {
        if ( ! current_user_can( get_post_type_object( 'post' )->cap->create_posts ) ) {
            wp_die( esc_html__( 'Sorry, you are not allowed to create notes.', 'wordpress-for-writers' ), 403 );
        }
        // An auto-draft, as post-new.php makes; the editor reports its id to the app.
        $post = get_default_post_to_edit( 'post', true );
    }

    $GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
    setup_postdata( $post );

    // Our writing surface inside the canvas iframe. Assets enqueued on
    // enqueue_block_assets are loaded into the canvas (the editor settings
    // collect them); added here so it's only ever this page's canvas.
    add_action( 'enqueue_block_assets', 'wfw_editor_canvas_assets' );

    $settings      = wfw_editor_settings( $post );
    $initial_edits = array();
    if ( 'auto-draft' === $post->post_status ) {
        $initial_edits = array(
            'title'   => $post->post_title,
            'content' => $post->post_content,
            'excerpt' => $post->post_excerpt,
        );
    }

    wfw_editor_enqueue( $post, $settings, $initial_edits );

    // No zooming in on fields, as in the app; iOS still allows pinch zoom.
    add_filter( 'admin_viewport_meta', function () {
        return 'width=device-width,initial-scale=1.0,maximum-scale=1.0';
    } );
    add_filter( 'admin_body_class', function ( $classes ) {
        return $classes . ' wfw-editor-page';
    } );

    iframe_header( esc_html__( 'Editor', 'wordpress-for-writers' ) );
    echo '<div id="wfw-editor-root"></div>';
    iframe_footer();
    exit;
} );

/**
 * Editor settings for a note: what edit-form-blocks.php passes to the editor,
 * minus what the Writer editor doesn't show (templates, patterns, meta boxes).
 */
function wfw_editor_settings( $post ) {
    $context = new WP_Block_Editor_Context( array( 'post' => $post ) );

    // The post lock, as wp-admin's editor takes it: the takeover dialog reads it.
    $locked_by = wp_check_post_lock( $post->ID );
    if ( $locked_by && apply_filters( 'show_post_locked_dialog', true, $post, $locked_by ) ) {
        $user = get_userdata( $locked_by );
        $lock = array(
            'isLocked' => true,
            'user'     => array(
                'name'   => $user ? $user->display_name : '',
                'avatar' => get_option( 'show_avatars' ) ? get_avatar_url( $locked_by, array( 'size' => 128 ) ) : '',
            ),
        );
    } else {
        $active = $locked_by ? false : wp_set_post_lock( $post->ID );
        $lock   = array(
            'isLocked'       => false,
            'activePostLock' => $active ? esc_attr( implode( ':', $active ) ) : false,
        );
    }

    $settings = array(
        'disablePostFormats' => ! current_theme_supports( 'post-formats' ),
        'titlePlaceholder'   => apply_filters( 'enter_title_here', __( 'Add title' ), $post ), // phpcs:ignore WordPress.WP.I18n.MissingArgDomain
        'bodyPlaceholder'    => '',
        'autosaveInterval'   => AUTOSAVE_INTERVAL,
        'richEditingEnabled' => user_can_richedit(),
        'postLock'           => $lock,
        'postLockUtils'      => array(
            'nonce'       => wp_create_nonce( 'lock-post_' . $post->ID ),
            'unlockNonce' => wp_create_nonce( 'update-post_' . $post->ID ),
            'ajaxUrl'     => admin_url( 'admin-ajax.php' ),
        ),
        'supportsLayout'     => wp_theme_has_theme_json(),
        'supportsTemplateMode' => false,
    );

    // A newer autosave than the note: the editor offers to restore it.
    $autosave = wp_get_post_autosave( $post->ID );
    if ( $autosave && mysql2date( 'U', $autosave->post_modified_gmt, false ) > mysql2date( 'U', $post->post_modified_gmt, false ) ) {
        $settings['autosave'] = array( 'editLink' => get_edit_post_link( $autosave->ID ) );
    }

    $settings = get_block_editor_settings( $settings, $context );

    /*
     * The canvas ignores the theme: the writing surface is ours (editor-content.css).
     * Only the global stylesheet's presets and the base layout rules go in, so color
     * and size classes still resolve and layouts still work; the theme's and the
     * user's styles and the theme's editor stylesheets are left out.
     */
    $settings['styles'] = array(
        array( 'css' => wp_get_global_stylesheet( array( 'variables' ) ) ),
        array( 'css' => wp_get_global_stylesheet( array( 'presets' ) ) ),
        array( 'css' => wp_get_global_stylesheet( array( 'base-layout-styles' ) ) ),
    );

    return $settings;
}

/**
 * Scripts and styles for the editor page, and the data editor.js starts from.
 */
function wfw_editor_enqueue( $post, $settings, $initial_edits ) {
    $rest_path = rest_get_route_for_post( $post );
    block_editor_rest_api_preload(
        array(
            '/wp/v2/types?context=view',
            '/wp/v2/types/post?context=edit',
            '/wp/v2/taxonomies?context=view',
            '/wp/v2/taxonomies?context=edit',
            add_query_arg( 'context', 'edit', $rest_path ),
            sprintf( '%s/autosaves?context=edit', $rest_path ),
            '/wp/v2/users/me',
            '/wp/v2/settings',
            array( rest_get_route_for_post_type_items( 'attachment' ), 'OPTIONS' ),
            array( rest_get_route_for_post_type_items( 'post' ), 'OPTIONS' ),
        ),
        new WP_Block_Editor_Context( array( 'post' => $post ) )
    );

    wp_add_inline_script( 'wp-blocks', sprintf( 'wp.blocks.setCategories( %s );', wp_json_encode( get_block_categories( $post ), JSON_HEX_TAG | JSON_UNESCAPED_SLASHES ) ), 'after' );
    wp_add_inline_script( 'wp-blocks', 'wp.blocks.unstable__bootstrapServerSideBlockDefinitions(' . wp_json_encode( get_block_editor_server_block_settings(), JSON_HEX_TAG | JSON_UNESCAPED_SLASHES ) . ');' );

    // The media library for image blocks, and the classic editor for classic content.
    wp_enqueue_media( array( 'post' => $post->ID ) );
    wp_enqueue_editor();
    wp_enqueue_script( 'heartbeat' );

    wp_enqueue_style( 'wfw-editor', WFW_URL . 'assets/editor.css', array( 'wp-components', 'wp-block-editor', 'wp-editor', 'wp-format-library', 'wp-block-library' ), wfw_asset_version( 'assets/editor.css' ) );
    wp_add_inline_style( 'wfw-editor', wfw_appearance_css() );
    $deps = array( 'wp-api-fetch', 'wp-block-editor', 'wp-block-library', 'wp-blocks', 'wp-components', 'wp-compose', 'wp-core-data', 'wp-data', 'wp-editor', 'wp-element', 'wp-format-library', 'wp-html-entities', 'wp-i18n', 'wp-keyboard-shortcuts', 'wp-plugins', 'wp-preferences' );
    // ThemeProvider (WordPress 7.0+) when there is one; the --wp-components-* variables in editor.css cover the rest.
    if ( wp_script_is( 'wp-theme', 'registered' ) ) {
        $deps[] = 'wp-theme';
    }
    wp_enqueue_script(
        'wfw-editor',
        WFW_URL . 'assets/editor.js',
        $deps,
        wfw_asset_version( 'assets/editor.js' ),
        true
    );

    $terms = wfw_terms_settings();
    wp_localize_script( 'wfw-editor', 'wfwEditor', array(
        'postId'         => $post->ID,
        'postType'       => $post->post_type,
        'settings'       => $settings,
        'initialEdits'   => (object) $initial_edits,
        'appearance'     => wfw_get_appearance(),
        // The links above the title open the app's featured image panel and categories and tags form.
        'featuredImages' => current_theme_supports( 'post-thumbnails', 'post' ) && post_type_supports( 'post', 'thumbnail' ),
        'categories'     => $terms['categories'],
        'tags'           => $terms['tags'],
        'visibility'     => wfw_visibility(),
        // wp-admin's own editor, for what this one leaves out (meta boxes, plugin sidebars, revisions).
        'fullEditorUrl'  => get_edit_post_link( $post->ID, 'raw' ),
    ) );

    // Plugins' block editor assets: their blocks, formats and document setting panels.
    do_action( 'enqueue_block_editor_assets' );
}

function wfw_editor_canvas_assets() {
    wp_enqueue_style( 'wfw-canvas', WFW_URL . 'assets/editor-content.css', array(), wfw_asset_version( 'assets/editor-content.css' ) );
    wp_add_inline_style( 'wfw-canvas', wfw_appearance_css() );
}

/**
 * Stamp the appearance attributes on the editor page's <html> before first paint.
 */
add_action( 'admin_head-admin_page_' . WFW_EDITOR_PAGE, function () {
    echo '<script>' . wfw_appearance_bootstrap_script() . '</script>'; // phpcs:ignore WordPress.Security.EscapeOutput
} );

/**
 * Whether this request was linked from the Writer editor page.
 */
function wfw_from_editor_page() {
    $referer = wp_get_referer();
    return $referer && false !== strpos( $referer, 'page=' . WFW_EDITOR_PAGE );
}

/**
 * Taking over a note from the editor's lock dialog goes through post.php, which
 * then sends the browser to the note's edit link. Coming from the Writer
 * editor, that's back to the Writer editor rather than wp-admin's.
 */
add_filter( 'get_edit_post_link', function ( $link, $post_id ) {
    if ( empty( $_GET['get-post-lock'] ) || ! did_action( 'load-post.php' ) || ! wfw_from_editor_page() ) { // phpcs:ignore WordPress.Security.NonceVerification
        return $link;
    }
    return wfw_editor_url( $post_id );
}, 10, 2 );

/**
 * The publish panel's "Add Post" link opens post-new.php; from the Writer
 * editor, a new note opens in the Writer editor instead.
 */
add_action( 'load-post-new.php', function () {
    $type = isset( $_GET['post_type'] ) ? sanitize_key( $_GET['post_type'] ) : 'post'; // phpcs:ignore WordPress.Security.NonceVerification
    if ( 'post' === $type && wfw_from_editor_page() ) {
        wp_safe_redirect( wfw_editor_url() );
        exit;
    }
} );
