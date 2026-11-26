<?php
/**
 * Plugin Name: WFW Test Helpers
 * Description: Test-only helpers for the WordPress for Writers end-to-end tests. Never ship.
 *
 * Routes under wfw-test/v1, for administrators only, that put the site in a
 * known state and reach the plugin's PHP functions from a web request (see
 * tests/e2e/agent-utils.ts). The folder is left out of every zip
 * (bin/build-zips.sh).
 */

defined( 'ABSPATH' ) || exit;

/**
 * The users the tests sign in as, made on first use. Every password is
 * "password", as wp-env's admin has.
 *
 * @return array<string, int> User ids by login.
 */
function wfw_test_users() {
    $users = array(
        'wfw_author'     => 'author',
        'wfw_author2'    => 'author',
        'wfw_subscriber' => 'subscriber',
    );
    $ids   = array();
    foreach ( $users as $login => $role ) {
        $user = get_user_by( 'login', $login );
        $id   = $user ? $user->ID : wp_insert_user( array(
            'user_login'   => $login,
            'user_pass'    => 'password',
            'user_email'   => $login . '@example.test',
            'role'         => $role,
            'display_name' => ucwords( str_replace( array( 'wfw_', '_' ), array( '', ' ' ), $login ) ),
        ) );
        $ids[ $login ] = (int) $id;
    }
    return $ids;
}

/**
 * Deletes what the tests make: every post with its comments (core notes
 * included), the agent surface's option and each user's style sheet.
 */
function wfw_test_reset() {
    $posts = get_posts( array(
        'post_type'   => 'post',
        'post_status' => array( 'any', 'trash', 'auto-draft' ),
        'numberposts' => -1,
        'fields'      => 'ids',
    ) );
    foreach ( $posts as $post_id ) {
        wp_delete_post( $post_id, true );
    }
    delete_option( 'wfw_agent_seen' );
    delete_metadata( 'user', 0, 'wfw_style_sheet', '', true );
    return array( 'users' => wfw_test_users() );
}

/**
 * A result as JSON: a WP_Error becomes { "error": { "code", "message", "data" } }.
 */
function wfw_test_result( $result ) {
    if ( is_wp_error( $result ) ) {
        return array(
            'error' => array(
                'code'    => $result->get_error_code(),
                'message' => $result->get_error_message(),
                'data'    => $result->get_error_data(),
            ),
        );
    }
    return array( 'result' => $result );
}

/**
 * A note as an agent reads it, by id (wfw_note_read() takes the post).
 */
function wfw_test_read( $note_id ) {
    $note = wfw_agent_note( (int) $note_id );
    return is_wp_error( $note ) ? $note : wfw_note_read( $note );
}

/**
 * A note's open asks, by id (wfw_note_asks() takes the post).
 */
function wfw_test_asks( $note_id ) {
    $note = wfw_agent_note( (int) $note_id );
    return is_wp_error( $note ) ? $note : wfw_note_asks( $note );
}

/**
 * An ask's passage, by ids (wfw_ask_anchor() takes the post).
 */
function wfw_test_ask_anchor( $note_id, $ask_id ) {
    $note = wfw_agent_note( (int) $note_id );
    return is_wp_error( $note ) ? $note : wfw_ask_anchor( $note, (int) $ask_id );
}

/**
 * The surface's meta on a comment, as stored: the keys it has, and nothing else.
 */
function wfw_test_meta( $comment_id ) {
    $meta = array();
    foreach ( wfw_suggestion_meta_keys() as $key ) {
        if ( metadata_exists( 'comment', (int) $comment_id, $key ) ) {
            $meta[ $key ] = get_comment_meta( (int) $comment_id, $key, true );
        }
    }
    return (object) $meta;
}

/**
 * Moves the time a suggestion was settled, to test what a day changes.
 */
function wfw_test_settle( $comment_id, $time ) {
    return update_comment_meta( (int) $comment_id, '_wfw_settled', (int) $time );
}

add_action( 'rest_api_init', function () {
    $admin = function () {
        return current_user_can( 'manage_options' );
    };

    register_rest_route( 'wfw-test/v1', '/reset', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => 'wfw_test_reset',
    ) );

    // Runs the plugin's uninstall.php, as deleting the plugin from the Plugins screen does.
    register_rest_route( 'wfw-test/v1', '/uninstall', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => function () {
            if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
                define( 'WP_UNINSTALL_PLUGIN', 'wordpress-for-writers' );
            }
            $main = new ReflectionFunction( 'wfw_text_domain' );
            require dirname( $main->getFileName() ) . '/uninstall.php';
            return array( 'done' => true );
        },
    ) );

    // Body: { "seen": false } removes wfw_agent_seen, true sets it to now, a number sets that time.
    register_rest_route( 'wfw-test/v1', '/seen', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => function ( WP_REST_Request $request ) {
            $seen = $request['seen'];
            if ( ! $seen ) {
                delete_option( 'wfw_agent_seen' );
            } else {
                update_option( 'wfw_agent_seen', true === $seen ? time() : (int) $seen, false );
            }
            return array( 'seen' => (int) get_option( 'wfw_agent_seen', 0 ) );
        },
    ) );

    /*
     * Calls one of the plugin's functions. Body: { "fn": "wfw_…", "args": [ … ],
     * "as": user id or login }. Only functions with the plugin's prefix run.
     */
    register_rest_route( 'wfw-test/v1', '/call', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => function ( WP_REST_Request $request ) {
            $fn = (string) $request['fn'];
            if ( 0 !== strpos( $fn, 'wfw_' ) || ! function_exists( $fn ) ) {
                return new WP_Error( 'wfw_test_no_function', 'No such function: ' . $fn, array( 'status' => 400 ) );
            }
            $before = get_current_user_id();
            if ( isset( $request['as'] ) ) {
                $user = is_numeric( $request['as'] ) ? get_user_by( 'id', (int) $request['as'] ) : get_user_by( 'login', (string) $request['as'] );
                wp_set_current_user( $user ? $user->ID : 0 );
            }
            $result = call_user_func_array( $fn, array_values( (array) $request['args'] ) );
            wp_set_current_user( $before );
            return wfw_test_result( $result );
        },
    ) );

    /*
     * Stores one pass of suggestions as an ability would: each suggestion's
     * "place" ({ "path", "quote", "occurrence" }, or { "path" } alone for a whole
     * block) is turned into its anchor against the note as it reads now.
     * Body: { "note", "pass": { "label", "ask", "source" }, "suggestions": [ { "kind",
     * "place", "change", "reason" } ], "as": user id or login }.
     */
    register_rest_route( 'wfw-test/v1', '/seed', array(
        'methods'             => 'POST',
        'permission_callback' => $admin,
        'callback'            => function ( WP_REST_Request $request ) {
            $before = get_current_user_id();
            if ( isset( $request['as'] ) ) {
                $user = is_numeric( $request['as'] ) ? get_user_by( 'id', (int) $request['as'] ) : get_user_by( 'login', (string) $request['as'] );
                wp_set_current_user( $user ? $user->ID : 0 );
            }
            $result = ( function () use ( $request ) {
                $note = wfw_agent_note( (int) $request['note'] );
                if ( is_wp_error( $note ) ) {
                    return $note;
                }
                $read        = wfw_note_read( $note );
                $suggestions = array();
                foreach ( (array) $request['suggestions'] as $suggestion ) {
                    $place = isset( $suggestion['place'] ) ? (array) $suggestion['place'] : null;
                    unset( $suggestion['place'] );
                    if ( $place ) {
                        $anchor = isset( $place['quote'] )
                            ? wfw_suggestion_anchor( $read['blocks'], (array) $place['path'], (string) $place['quote'], isset( $place['occurrence'] ) ? (int) $place['occurrence'] : 0 )
                            : wfw_block_anchor( $read['blocks'], (array) $place['path'] );
                        if ( is_wp_error( $anchor ) ) {
                            return $anchor;
                        }
                        $suggestion['anchor'] = $anchor;
                    }
                    $suggestions[] = $suggestion;
                }
                return wfw_suggestions_create( $note->ID, (array) $request['pass'], $suggestions );
            } )();
            wp_set_current_user( $before );
            return wfw_test_result( $result );
        },
    ) );
} );
