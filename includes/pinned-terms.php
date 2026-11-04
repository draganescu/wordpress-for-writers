<?php
/**
 * Pinned categories and tags: terms a writer adds to the app's main menu, below
 * the built-in views, from the term's context menu. Stored per user in pin
 * order, in user meta that the app saves through the REST API, like appearance.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The user meta key. It carries the site's table prefix, like a user option,
 * so each site of a network keeps its own pins: term IDs differ between sites.
 */
function wfw_pinned_terms_key() {
    global $wpdb;
    return $wpdb->get_blog_prefix() . 'wfw_pinned_terms';
}

/**
 * Pins as stored: a list of { taxonomy, id } in pin order, without repeats or
 * terms that no longer exist, so a deleted term drops out quietly.
 */
function wfw_sanitize_pinned_terms( $value ) {
    $pins = array();
    foreach ( is_array( $value ) ? $value : array() as $pin ) {
        $taxonomy = is_array( $pin ) && isset( $pin['taxonomy'] ) ? $pin['taxonomy'] : '';
        $id       = is_array( $pin ) && isset( $pin['id'] ) ? absint( $pin['id'] ) : 0;
        if ( $id && in_array( $taxonomy, array( 'category', 'post_tag' ), true ) && get_term( $id, $taxonomy ) instanceof WP_Term ) {
            $pins[ $taxonomy . ':' . $id ] = array(
                'taxonomy' => $taxonomy,
                'id'       => $id,
            );
        }
    }
    return array_values( $pins );
}

add_action( 'init', function () {
    register_meta( 'user', wfw_pinned_terms_key(), array(
        'type'              => 'array',
        'single'            => true,
        'default'           => array(),
        'sanitize_callback' => 'wfw_sanitize_pinned_terms',
        'show_in_rest'      => array(
            'schema' => array(
                'type'    => 'array',
                'context' => array( 'edit' ),
                'items'   => array(
                    'type'                 => 'object',
                    'properties'           => array(
                        'taxonomy' => array(
                            'type' => 'string',
                            'enum' => array( 'category', 'post_tag' ),
                        ),
                        'id'       => array(
                            'type'    => 'integer',
                            'minimum' => 1,
                        ),
                    ),
                    'additionalProperties' => false,
                ),
            ),
        ),
    ) );
} );

/**
 * The current user's pins with each term's name and archive link, so the app
 * can show them before its term lists load, and past their first 100 terms.
 */
function wfw_pinned_terms_client_data() {
    $pins = array();
    foreach ( wfw_sanitize_pinned_terms( get_user_meta( get_current_user_id(), wfw_pinned_terms_key(), true ) ) as $pin ) {
        $term   = get_term( $pin['id'], $pin['taxonomy'] );
        $link   = get_term_link( $term );
        $pins[] = $pin + array(
            'name' => $term->name,
            'link' => is_wp_error( $link ) ? '' : $link,
        );
    }
    return $pins;
}
