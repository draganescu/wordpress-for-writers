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
 * The teaser text: the writer's own excerpt, or the first words of what
 * comes before the paywall (of the whole post when it has none). Never words
 * from behind the paywall.
 */
function wmem_teaser_text( $post ) {
    if ( has_excerpt( $post ) ) {
        return $post->post_excerpt;
    }
    $before = wmem_before_paywall( $post->post_content );
    $source = null === $before ? $post->post_content : $before;
    $length = (int) apply_filters( 'excerpt_length', 55 );
    return wp_trim_words( wp_strip_all_tags( strip_shortcodes( excerpt_remove_blocks( $source ) ) ), $length );
}

/**
 * The teaser as block markup, shown when a gated post has no paywall block.
 */
function wmem_teaser( $post ) {
    return "<!-- wp:paragraph -->\n<p>" . esc_html( wmem_teaser_text( $post ) ) . "</p>\n<!-- /wp:paragraph -->";
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
 * API's content.rendered and excerpt.rendered. Some callers, such as
 * trackbacks, run outside the loop and pass the post ID instead.
 */
add_filter( 'the_content', function ( $content, $post_id = 0 ) {
    $post = $post_id ? get_post( $post_id ) : get_post();
    if ( ! $post || ! wmem_should_lock( $post ) ) {
        return $content;
    }
    // Leave the password form alone; core shows it instead of any content.
    if ( post_password_required( $post ) ) {
        return $content;
    }
    // The auto excerpt is plain text: leave the upgrade box out of it.
    return wmem_locked_content( $post, ! doing_filter( 'get_the_excerpt' ) );
}, 1, 2 );

/**
 * Excerpts for gated posts are the teaser, before wp_trim_excerpt builds one
 * from the content. Works from the post passed in, so it holds outside the loop.
 */
add_filter( 'get_the_excerpt', function ( $excerpt, $post = null ) {
    $post = get_post( $post );
    if ( ! $post || ! wmem_should_lock( $post ) ) {
        return $excerpt;
    }
    return wmem_teaser_text( $post );
}, 9, 2 );

/**
 * The REST API hands out content.raw and excerpt.raw in the edit context to
 * anyone who can edit posts, for every post in a collection, without asking
 * whether they can edit that one. Swap in the locked version for people who
 * can't read the post in full.
 */
add_action( 'init', function () {
    foreach ( wmem_post_types() as $type ) {
        add_filter( 'rest_prepare_' . $type, 'wmem_rest_lock_raw', 10, 2 );
    }
}, 20 );

function wmem_rest_lock_raw( $response, $post ) {
    if ( ! wmem_is_gated( $post ) || wmem_can_read( $post ) ) {
        return $response;
    }
    $data = $response->get_data();
    if ( isset( $data['content']['raw'] ) ) {
        $data['content']['raw'] = wmem_locked_content( $post, false );
        if ( isset( $data['content']['block_version'] ) ) {
            $data['content']['block_version'] = block_version( $data['content']['raw'] );
        }
    }
    if ( isset( $data['excerpt']['raw'] ) ) {
        $data['excerpt']['raw'] = wmem_teaser_text( $post );
    }
    $response->set_data( $data );
    return $response;
}

/**
 * The Latest Posts block's "full post" mode prints post_content directly,
 * without the_content, so any author could list every gated post in full.
 * For readers who can't read everything, it falls back to excerpts (which
 * are the teaser for gated posts).
 */
add_filter( 'render_block_data', function ( $block ) {
    if ( 'core/latest-posts' === ( $block['blockName'] ?? '' )
        && 'full_post' === ( $block['attrs']['displayPostContentRadio'] ?? '' )
        && ! current_user_can( 'edit_others_posts' ) ) {
        $block['attrs']['displayPostContentRadio'] = 'excerpt';
    }
    return $block;
} );

/**
 * Search must not reveal what is behind a paywall: for people who can't
 * edit others' posts, gated posts match on title and excerpt only. Covers
 * the site search, /wp/v2/search and ?search= on the posts endpoints.
 */
add_filter( 'posts_search', function ( $search, $query ) {
    global $wpdb;
    if ( '' === $search || current_user_can( 'edit_others_posts' ) ) {
        return $search;
    }
    $like  = "/{$wpdb->posts}\.post_content LIKE '(?:[^'\\\\]|\\\\.)*'/";
    $count = 0;
    $search = preg_replace_callback(
        $like,
        function ( $m ) {
            return '(' . $m[0] . ' AND wmem_gate.meta_id IS NULL)';
        },
        $search,
        -1,
        $count
    );
    if ( $count ) {
        $query->set( 'wmem_search_gate', true );
    }
    return $search;
}, 10, 2 );

add_filter( 'posts_join', function ( $join, $query ) {
    global $wpdb;
    if ( $query->get( 'wmem_search_gate' ) ) {
        $join .= " LEFT JOIN {$wpdb->postmeta} AS wmem_gate ON ( wmem_gate.post_id = {$wpdb->posts}.ID AND wmem_gate.meta_key = 'wmem_tier' AND wmem_gate.meta_value <> '' )";
    }
    return $join;
}, 10, 2 );

/**
 * The paywall block renders nothing for readers with access, and the
 * upgrade box for everyone else.
 */
function wmem_render_paywall() {
    $post = get_post();
    if ( ! $post || ! wmem_should_lock( $post ) || post_password_required( $post ) ) {
        return '';
    }
    return wmem_upgrade_box( $post );
}

/**
 * Payment link for a tier, with the reader's email prefilled when known.
 * The webhook works out the tier from the Payment Link itself, never from
 * anything in this URL.
 */
function wmem_payment_url( $tier ) {
    if ( empty( $tier['link'] ) ) {
        return '';
    }
    $args = array();
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
    $heading = str_replace( '%s', $name, $heading );

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
 * Members see different pages than everyone else: gated posts, and any list
 * or Query Loop that shows their content. So no page a logged-in visitor gets
 * may be stored by a page cache. Most page caches already skip logged-in
 * visitors (they see the WordPress auth cookie); this covers the ones that
 * only follow Cache-Control.
 */
add_action( 'template_redirect', function () {
    if ( is_user_logged_in() ) {
        nocache_headers();
    }
} );
