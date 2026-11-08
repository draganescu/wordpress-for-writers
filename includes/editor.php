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
    add_submenu_page( '', __( 'Editor', 'wordpress-for-writers' ), '', 'read', WFW_EDITOR_PAGE, '__return_null' );
} );

/**
 * Print the editor page and stop, before wp-admin draws its own chrome.
 */
add_action( 'load-admin_page_' . WFW_EDITOR_PAGE, function () {
    require_once ABSPATH . 'wp-admin/includes/post.php';

    // The editor is part of Writer: only for those who can use Writer (see wfw_capability()).
    if ( ! wfw_user_can_write() ) {
        wp_die(
            esc_html__( 'Writer, and its editor, are open to the people who write on this site.', 'wordpress-for-writers' ),
            esc_html__( 'Writer isn’t available for your account', 'wordpress-for-writers' ),
            array( 'response' => 403, 'link_url' => admin_url( 'admin.php?page=' . WFW_PAGE ), 'link_text' => esc_html__( 'Why?', 'wordpress-for-writers' ) )
        );
    }

    $post_id = isset( $_GET['post'] ) ? absint( $_GET['post'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification
    if ( $post_id ) {
        /*
         * One answer for a note that doesn't exist, isn't a post, or isn't the
         * user's to edit, so the page doesn't tell which IDs exist.
         */
        $post = get_post( $post_id );
        if ( ! $post || 'post' !== $post->post_type || ! current_user_can( 'edit_post', $post->ID ) ) {
            wp_die( esc_html__( 'Sorry, you can\'t edit this note.', 'wordpress-for-writers' ), 403 );
        }
        if ( 'trash' === $post->post_status ) {
            wp_die( esc_html__( 'This note is in the Trash. Restore it to edit it.', 'wordpress-for-writers' ) );
        }
    } else {
        if ( ! current_user_can( get_post_type_object( 'post' )->cap->create_posts ) ) {
            wp_die( esc_html__( 'Sorry, you can\'t create notes.', 'wordpress-for-writers' ), 403 );
        }
        /*
         * A new note is an auto-draft, as post-new.php makes. Creating one
         * takes the REST nonce the app already holds (its API client keeps it
         * fresh), so another site can't make a writer's browser create drafts
         * just by loading this URL.
         */
        $nonce = isset( $_GET['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) ) : '';
        if ( ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
            wp_die( esc_html__( 'This link to a new note has expired. Start the note again from the app.', 'wordpress-for-writers' ), 403 );
        }
        $post = get_default_post_to_edit( 'post', true );
    }

    $GLOBALS['post'] = $post; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
    setup_postdata( $post );

    // A block editor screen, as wp-admin's editor marks its own, so core and
    // plugins treat it as one.
    get_current_screen()->is_block_editor( true );

    /*
     * Cross-origin isolation, as core sets up for wp-admin's editor
     * (load-post.php): in Chromium the editor runs in its own agent cluster,
     * and client-side media processing (WordPress 7.1+) can run in it. The app
     * only talks to the editor through postMessage, which isolation allows.
     */
    if ( function_exists( 'wp_set_up_cross_origin_isolation' ) ) {
        wp_set_up_cross_origin_isolation();
    }

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

    $settings['allowedBlockTypes'] = wfw_allowed_block_types( $settings['allowedBlockTypes'] ?? true );

    /*
     * The canvas ignores the theme: the writing surface is ours (editor-content.css),
     * and the theme's editor stylesheets are left out.
     */
    $settings['styles'] = array(
        array( 'css' => wfw_canvas_global_stylesheet() ),
    );

    return $settings;
}

/**
 * The core blocks a note can be written with. The Writer editor is for
 * writing, not page building: layout (columns, groups, spacers), the theme's
 * blocks (site, query, post, comment, navigation) and widgets are left out,
 * as are other plugins' blocks: only core's and Writer's own are offered.
 *
 * Only the inserter and transforms are limited: a note that already holds a
 * left-out block still shows and edits it.
 *
 * @param bool|string[] $allowed What allowed_block_types_all decided.
 * @return bool|string[]
 */
function wfw_allowed_block_types( $allowed ) {
    if ( false === $allowed ) {
        return false;
    }

    $blocks = array(
        // Text.
        'core/paragraph',
        'core/heading',
        'core/list',
        'core/list-item',
        'core/quote',
        'core/pullquote',
        'core/verse',
        'core/preformatted',
        'core/code',
        'core/footnotes',
        'core/details',
        'core/table',
        'core/math',
        'core/separator',
        'core/spacer',
        'core/text-columns',
        // Media.
        'core/image',
        'core/gallery',
        'core/cover',
        'core/video',
        'core/audio',
        'core/playlist',
        'core/playlist-track',
        'core/file',
        'core/embed',
        // Calls to action.
        'core/buttons',
        'core/button',
        // Writer's companion plugins, when active.
        'writer-members/paywall',
        'writer-subscribe/form',
    );

    return is_array( $allowed ) ? array_values( array_intersect( $blocks, $allowed ) ) : $blocks;
}

/**
 * The global stylesheet without the theme's and the user's styles.
 *
 * Their settings stay (palette, font sizes, content and wide widths), so preset
 * classes and variables resolve as on the site, and core still prints its own
 * defaults: the layout and alignment rules, block gaps, the button element and
 * the default block styles. Only the styles a theme or the user layered on top
 * are left out, through the theme.json data filters, for this one stylesheet.
 */
function wfw_canvas_global_stylesheet() {
    $strip_theme = function ( $data ) {
        return wfw_theme_json_without_styles( $data, 'theme' );
    };
    $strip_user = function ( $data ) {
        return wfw_theme_json_without_styles( $data, 'custom' );
    };

    add_filter( 'wp_theme_json_data_theme', $strip_theme, PHP_INT_MAX );
    add_filter( 'wp_theme_json_data_user', $strip_user, PHP_INT_MAX );
    wp_clean_theme_json_cache();

    $css = wp_get_global_stylesheet( array( 'variables', 'presets', 'styles' ) );

    remove_filter( 'wp_theme_json_data_theme', $strip_theme, PHP_INT_MAX );
    remove_filter( 'wp_theme_json_data_user', $strip_user, PHP_INT_MAX );
    wp_clean_theme_json_cache();

    return $css;
}

/**
 * A theme.json origin's data with its settings and without its styles.
 *
 * @param WP_Theme_JSON_Data $data   The origin's data, as the filter hands it over.
 * @param string             $origin 'theme' or 'custom'.
 * @return WP_Theme_JSON_Data
 */
function wfw_theme_json_without_styles( $data, $origin ) {
    $raw = $data->get_data();
    unset( $raw['styles'] );

    /*
     * The writing surface's own choices, said in theme.json so core prints them
     * like any theme's: the note's rhythm between blocks, and buttons in the
     * appearance's accent (the --wfw-* tokens editor.js sets on the canvas).
     */
    if ( 'theme' === $origin ) {
        $raw['styles'] = array(
            'spacing'  => array( 'blockGap' => '0.85em' ),
            'elements' => array(
                'button' => array(
                    'color' => array(
                        'background' => 'var(--wfw-accent)',
                        'text'       => 'var(--wfw-editor-bg)',
                    ),
                ),
            ),
        );
    }

    return new WP_Theme_JSON_Data( $raw, $origin );
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
    $deps = array( 'wp-api-fetch', 'wp-block-editor', 'wp-block-library', 'wp-blocks', 'wp-components', 'wp-compose', 'wp-core-data', 'wp-data', 'wp-editor', 'wp-element', 'wp-format-library', 'wp-html-entities', 'wp-i18n', 'wp-keyboard-shortcuts', 'wp-plugins', 'wp-preferences', 'wp-theme' );
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
