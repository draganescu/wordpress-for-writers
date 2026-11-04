<?php
/**
 * Writer Longform: stylesheet, reading time and optional Writer Subscribe patterns.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;

/**
 * Front-end and editor stylesheet for the details theme.json can't express.
 */
function writer_longform_setup() {
    add_editor_style( 'assets/theme.css' );

    // Style variations named after the Writer app's colour schemes, so
    // WordPress for Writers can match the site to the writer's chosen scheme.
    add_theme_support( 'wfw-color-schemes' );
}
add_action( 'after_setup_theme', 'writer_longform_setup' );

function writer_longform_styles() {
    $file = get_theme_file_path( 'assets/theme.css' );
    wp_enqueue_style( 'writer-longform', get_theme_file_uri( 'assets/theme.css' ), array(), (string) filemtime( $file ) );
}
add_action( 'wp_enqueue_scripts', 'writer_longform_styles' );

/**
 * Reading time for a post, e.g. "4 min read". Counts words at 230 a minute.
 *
 * @param int $post_id Post ID.
 * @return string
 */
function writer_longform_reading_time( $post_id ) {
    // A protected post only shows its password form, so there's nothing to time.
    if ( post_password_required( $post_id ) ) {
        return '';
    }
    $content = get_post_field( 'post_content', $post_id );
    if ( ! is_string( $content ) || '' === $content ) {
        return '';
    }
    // preg_split() returns false on invalid UTF-8.
    $parts = preg_split( '/\s+/u', trim( wp_strip_all_tags( strip_shortcodes( $content ) ) ), -1, PREG_SPLIT_NO_EMPTY );
    $words = is_array( $parts ) ? count( $parts ) : 0;
    if ( 0 === $words ) {
        return '';
    }
    $minutes = max( 1, (int) round( $words / 230 ) );

    /* translators: %d: minutes needed to read the post. */
    return sprintf( _n( '%d min read', '%d min read', $minutes, 'writer-longform' ), $minutes );
}

/**
 * A block binding so templates can show the reading time in a Paragraph block.
 */
function writer_longform_register_bindings() {
    if ( ! function_exists( 'register_block_bindings_source' ) ) {
        return;
    }
    register_block_bindings_source(
        'writer-longform/reading-time',
        array(
            'label'              => __( 'Reading time', 'writer-longform' ),
            'uses_context'       => array( 'postId' ),
            'get_value_callback' => function ( $source_args, $block_instance ) {
                $post_id = $block_instance->context['postId'] ?? get_the_ID();
                return $post_id ? esc_html( writer_longform_reading_time( $post_id ) ) : '';
            },
        )
    );
}
add_action( 'init', 'writer_longform_register_bindings' );

/**
 * Subscribe patterns, only when the Writer Subscribe plugin has registered
 * its form block. Templates reference these by slug; when they aren't
 * registered the Pattern block renders nothing, so the theme still works
 * without the plugin.
 */
function writer_longform_subscribe_patterns() {
    if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'writer-subscribe/form' ) ) {
        return;
    }

    $patterns = array(
        'subscribe-header' => array(
            'title'    => __( 'Header subscribe button', 'writer-longform' ),
            'inserter' => false,
        ),
        'subscribe-box'    => array(
            'title'    => __( 'Subscribe box after the post', 'writer-longform' ),
            'inserter' => false,
        ),
        'subscribe-inline' => array(
            'title'    => __( 'Subscribe box', 'writer-longform' ),
            'inserter' => true,
        ),
        'subscribe-footer' => array(
            'title'    => __( 'Footer subscribe section', 'writer-longform' ),
            'inserter' => false,
        ),
    );

    foreach ( $patterns as $slug => $args ) {
        ob_start();
        include __DIR__ . '/inc/subscribe/' . $slug . '.php';
        register_block_pattern(
            'writer-longform/' . $slug,
            array(
                'title'      => $args['title'],
                'categories' => array( 'call-to-action' ),
                'inserter'   => $args['inserter'],
                'content'    => ob_get_clean(),
            )
        );
    }
}
add_action( 'init', 'writer_longform_subscribe_patterns', 20 );

/**
 * Heading style that opts a heading out of the chapter numbering.
 */
function writer_longform_block_styles() {
    register_block_style(
        'core/heading',
        array(
            'name'  => 'plain',
            'label' => __( 'Plain (no chapter number)', 'writer-longform' ),
        )
    );
}
add_action( 'init', 'writer_longform_block_styles' );
