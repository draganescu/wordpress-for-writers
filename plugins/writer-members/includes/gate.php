<?php
/**
 * Per-post gating: the `wmem_tier` post meta, the paywall block, and the
 * content filter that cuts gated posts short on the site, in feeds and in
 * the REST API.
 */

defined( 'ABSPATH' ) || exit;

add_action( 'init', function () {
    foreach ( wmem_post_types() as $type ) {
        register_post_meta(
            $type,
            'wmem_tier',
            array(
                'type'              => 'string',
                'description'       => __( 'Lowest membership tier that can read this post in full. Empty means everyone.', 'writer-members' ),
                'single'            => true,
                'default'           => '',
                'show_in_rest'      => true,
                'sanitize_callback' => 'sanitize_key',
                'auth_callback'     => function ( $allowed, $meta_key, $post_id ) {
                    return current_user_can( 'edit_post', $post_id );
                },
            )
        );
    }

    wp_register_script(
        'wmem-block',
        WMEM_URL . 'assets/block.js',
        array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-i18n' ),
        wmem_asset_version( 'assets/block.js' ),
        true
    );
    wp_register_style( 'wmem', WMEM_URL . 'assets/members.css', array(), wmem_asset_version( 'assets/members.css' ) );

    register_block_type(
        'writer-members/paywall',
        array(
            'api_version'     => 3,
            'title'           => __( 'Paywall', 'writer-members' ),
            'description'     => __( 'Readers without access stop here and see an upgrade box.', 'writer-members' ),
            'category'        => 'design',
            'icon'            => 'lock',
            'editor_script'   => 'wmem-block',
            'style'           => 'wmem',
            'supports'        => array( 'html' => false, 'multiple' => false, 'reusable' => false ),
            'render_callback' => 'wmem_render_paywall',
        )
    );
} );

/**
 * Feeds are shared and cached, so they always get the cut version, whoever
 * asks. Everywhere else it depends on the reader.
 */
function wmem_should_lock( $post ) {
    if ( ! wmem_is_gated( $post ) ) {
        return false;
    }
    return is_feed() || ! wmem_can_read( $post );
}

/**
 * Block markup before the paywall block, or null when the post has no
 * paywall at its top level.
 */
function wmem_before_paywall( $raw ) {
    if ( ! has_block( 'writer-members/paywall', $raw ) ) {
        return null;
    }
    $keep = array();
    foreach ( parse_blocks( $raw ) as $block ) {
        if ( 'writer-members/paywall' === $block['blockName'] ) {
            return serialize_blocks( $keep );
        }
        $keep[] = $block;
    }
    return null; // Only nested inside another block: fall back to the teaser.
}

/**
 * The teaser shown when a gated post has no paywall block: the writer's own
 * excerpt, or the first words of the post.
 */
function wmem_teaser( $post ) {
    if ( has_excerpt( $post ) ) {
        $text = $post->post_excerpt;
    } else {
        $length = (int) apply_filters( 'excerpt_length', 55 );
        $text   = wp_trim_words( wp_strip_all_tags( strip_shortcodes( excerpt_remove_blocks( $post->post_content ) ) ), $length );
    }
    return "<!-- wp:paragraph -->\n<p>" . esc_html( $text ) . "</p>\n<!-- /wp:paragraph -->";
}

/**
 * What a reader without access gets, as block markup. The cut is always
 * worked out from the stored post content, never from the content passed to
 * the filter, so callers that strip blocks first (like the auto excerpt)
 * can't push it past the paywall.
 */
function wmem_locked_content( $post, $with_box = true ) {
    $before = wmem_before_paywall( $post->post_content );
    if ( null === $before ) {
        $before = wmem_teaser( $post );
    }
    return $with_box ? $before . "\n\n<!-- wp:writer-members/paywall /-->" : $before;
}

/**
 * Runs before do_blocks (priority 9), so the hidden part is never rendered.
 * Covers the post page, the Post Content block, the auto excerpt, feeds
 * (the_content_feed and the_excerpt_rss both go through here) and the REST
 * API's content.rendered and excerpt.rendered.
 */
add_filter( 'the_content', function ( $content ) {
    $post = get_post();
    if ( ! $post || ! wmem_should_lock( $post ) ) {
        return $content;
    }
    // The auto excerpt is plain text: leave the upgrade box out of it.
    return wmem_locked_content( $post, ! doing_filter( 'get_the_excerpt' ) );
}, 1 );

/**
 * The paywall block renders nothing for readers with access, and the
 * upgrade box for everyone else.
 */
function wmem_render_paywall() {
    $post = get_post();
    if ( ! $post || ! wmem_should_lock( $post ) ) {
        return '';
    }
    return wmem_upgrade_box( $post );
}

/**
 * Payment link for a tier, with the tier slug as client_reference_id (the
 * webhook reads it back) and the reader's email prefilled when known.
 */
function wmem_payment_url( $tier ) {
    if ( empty( $tier['link'] ) ) {
        return '';
    }
    $args = array( 'client_reference_id' => $tier['slug'] );
    $user = wp_get_current_user();
    if ( $user->exists() ) {
        $args['prefilled_email'] = rawurlencode( $user->user_email );
    }
    return add_query_arg( $args, $tier['link'] );
}

function wmem_upgrade_box( $post ) {
    $slug = wmem_post_tier( $post );
    $tier = wmem_tier( $slug );
    $name = $tier ? $tier['name'] : __( 'paying', 'writer-members' );
    $user = wp_get_current_user();

    $actions = array();
    if ( $tier && $tier['link'] ) {
        $actions[] = sprintf(
            '<a class="wmem-paywall__button" href="%s">%s</a>',
            esc_url( wmem_payment_url( $tier ) ),
            /* translators: %s: tier name */
            esc_html( sprintf( __( 'Become a %s member', 'writer-members' ), $name ) )
        );
    } elseif ( $tier && 0 === wmem_tier_rank( $slug ) && ! $user->exists() && get_option( 'users_can_register' ) ) {
        $actions[] = sprintf(
            '<a class="wmem-paywall__button" href="%s">%s</a>',
            esc_url( wp_registration_url() ),
            esc_html__( 'Sign up free', 'writer-members' )
        );
    }
    if ( $user->exists() ) {
        $current   = wmem_tier( wmem_user_tier( $user->ID ) );
        $actions[] = '<span class="wmem-paywall__note">' . esc_html(
            $current
                /* translators: %s: tier name */
                ? sprintf( __( 'You’re a %s member.', 'writer-members' ), $current['name'] )
                : __( 'You’re signed in.', 'writer-members' )
        ) . '</span>';
    } else {
        $actions[] = sprintf(
            '<a class="wmem-paywall__login" href="%s">%s</a>',
            esc_url( wp_login_url( get_permalink( $post ) ) ),
            esc_html__( 'Already a member? Log in', 'writer-members' )
        );
    }

    $heading = (string) wmem_setting( 'heading' );
    $heading = false !== strpos( $heading, '%s' ) ? sprintf( $heading, $name ) : $heading;

    $html  = '<div class="wmem-paywall">';
    $html .= '<p class="wmem-paywall__heading">' . esc_html( $heading ) . '</p>';
    if ( wmem_setting( 'text' ) ) {
        $html .= '<p class="wmem-paywall__text">' . esc_html( wmem_setting( 'text' ) ) . '</p>';
    }
    $html .= '<p class="wmem-paywall__actions">' . implode( ' ', $actions ) . '</p>';
    $html .= '</div>';

    return apply_filters( 'wmem_upgrade_box', $html, $post, $tier );
}

/**
 * Members see a different page than everyone else, so a gated post must not
 * be stored by a page cache for them. Most page caches already skip
 * logged-in visitors (they see the WordPress auth cookie); this covers the
 * ones that only follow Cache-Control.
 */
add_action( 'template_redirect', function () {
    if ( is_singular() && is_user_logged_in() && wmem_is_gated( get_queried_object() ) ) {
        nocache_headers();
    }
} );
