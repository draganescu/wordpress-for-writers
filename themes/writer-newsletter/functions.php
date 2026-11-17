<?php
/**
 * Writer Newsletter: stylesheet, reading time and optional Writer Subscribe patterns.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;

/**
 * Front-end and editor stylesheet for the details theme.json can't express.
 */
function writer_newsletter_setup() {
    add_editor_style( 'assets/theme.css' );

    // Style variations named after the Writer app's colour schemes, so
    // WordPress for Writers can match the site to the writer's chosen scheme.
    add_theme_support( 'wfw-color-schemes' );
}
add_action( 'after_setup_theme', 'writer_newsletter_setup' );

function writer_newsletter_styles() {
    $file = get_theme_file_path( 'assets/theme.css' );
    wp_enqueue_style( 'writer-newsletter', get_theme_file_uri( 'assets/theme.css' ), array(), (string) filemtime( $file ) );
}
add_action( 'wp_enqueue_scripts', 'writer_newsletter_styles' );

/**
 * Reading time for a post, e.g. "4 min read". Counts words at 230 a minute.
 *
 * @param int $post_id Post ID.
 * @return string
 */
function writer_newsletter_reading_time( $post_id ) {
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
    return sprintf( _n( '%d min read', '%d min read', $minutes, 'writer-newsletter' ), $minutes );
}

/**
 * A block binding so templates can show the reading time in a Paragraph block.
 */
function writer_newsletter_register_bindings() {
    if ( ! function_exists( 'register_block_bindings_source' ) ) {
        return;
    }
    register_block_bindings_source(
        'writer-newsletter/reading-time',
        array(
            'label'              => __( 'Reading time', 'writer-newsletter' ),
            'uses_context'       => array( 'postId' ),
            'get_value_callback' => function ( $source_args, $block_instance ) {
                $post_id = $block_instance->context['postId'] ?? get_the_ID();
                return $post_id ? esc_html( writer_newsletter_reading_time( $post_id ) ) : '';
            },
        )
    );
}
add_action( 'init', 'writer_newsletter_register_bindings' );

/**
 * Subscribe patterns, only when the Writer Subscribe plugin has registered
 * its form block. Templates reference these by slug; when they aren't
 * registered the Pattern block renders nothing, so the theme still works
 * without the plugin.
 */
function writer_newsletter_subscribe_patterns() {
    if ( ! WP_Block_Type_Registry::get_instance()->is_registered( 'writer-subscribe/form' ) ) {
        return;
    }

    $patterns = array(
        'subscribe-header' => array(
            'title'    => __( 'Header subscribe button', 'writer-newsletter' ),
            'inserter' => false,
        ),
        'subscribe-box'    => array(
            'title'    => __( 'Subscribe box after the post', 'writer-newsletter' ),
            'inserter' => false,
        ),
        'subscribe-inline' => array(
            'title'    => __( 'Subscribe box', 'writer-newsletter' ),
            'inserter' => true,
        ),
        'subscribe-footer' => array(
            'title'    => __( 'Footer subscribe section', 'writer-newsletter' ),
            'inserter' => false,
        ),
    );

    foreach ( $patterns as $slug => $args ) {
        ob_start();
        include __DIR__ . '/inc/subscribe/' . $slug . '.php';
        register_block_pattern(
            'writer-newsletter/' . $slug,
            array(
                'title'      => $args['title'],
                'categories' => array( 'call-to-action' ),
                'inserter'   => $args['inserter'],
                'content'    => ob_get_clean(),
            )
        );
    }
}
add_action( 'init', 'writer_newsletter_subscribe_patterns', 20 );

/**
 * Short posts in lists. A status, image, gallery, video or audio post (the
 * Writer app's quick notes) is the thing itself, often with no title: in the
 * home page and archives it shows in full where other posts show an excerpt,
 * which would drop its media, and its date links to it when it has no title
 * to link from. The content goes through the_content, so a gated post (Writer
 * Members) shows what its gate allows, as on its own page.
 */
function writer_newsletter_short_format( $post_id ) {
    $format = $post_id ? get_post_format( $post_id ) : false;
    return in_array( $format, array( 'status', 'image', 'gallery', 'video', 'audio' ), true );
}

function writer_newsletter_short_post_excerpt( $content, $block, $instance ) {
    $post_id = isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : 0;
    if ( is_singular() && get_queried_object_id() === $post_id ) {
        return $content;
    }
    if ( ! writer_newsletter_short_format( $post_id ) || post_password_required( $post_id ) ) {
        return $content;
    }
    $post = get_post( $post_id );
    // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- core filter.
    $html = apply_filters( 'the_content', get_the_content( null, false, $post ) );
    return '<div class="wp-block-post-excerpt writer-newsletter-short-post">' . $html . '</div>';
}
add_filter( 'render_block_core/post-excerpt', 'writer_newsletter_short_post_excerpt', 10, 3 );

function writer_newsletter_untitled_post_date( $content, $block, $instance ) {
    $post_id = isset( $instance->context['postId'] ) ? (int) $instance->context['postId'] : 0;
    $own_page = is_singular() && get_queried_object_id() === $post_id;
    if ( ! $post_id || $own_page || '' !== get_the_title( $post_id ) || false !== strpos( $content, '<a ' ) ) {
        return $content;
    }
    return preg_replace(
        '#(<time\b[^>]*>)(.*?)(</time>)#s',
        '$1<a href="' . esc_url( get_permalink( $post_id ) ) . '">$2</a>$3',
        $content,
        1
    );
}
add_filter( 'render_block_core/post-date', 'writer_newsletter_untitled_post_date', 10, 3 );
