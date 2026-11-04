<?php
/**
 * Subscriber storage: a dedicated table, so large lists stay fast and stay
 * out of wp_users.
 */

defined( 'ABSPATH' ) || exit;

function wsub_table() {
    global $wpdb;
    return $wpdb->prefix . 'wsub_subscribers';
}

function wsub_install() {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';

    $table   = wsub_table();
    $charset = $wpdb->get_charset_collate();

    dbDelta( "CREATE TABLE {$table} (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        email varchar(190) NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'pending',
        token char(32) NOT NULL,
        source varchar(100) NOT NULL DEFAULT '',
        created_at datetime NOT NULL,
        confirmed_at datetime NULL DEFAULT NULL,
        unsubscribed_at datetime NULL DEFAULT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY email (email),
        UNIQUE KEY token (token),
        KEY status (status)
    ) {$charset};" );

    update_option( 'wsub_db_version', WSUB_DB_VERSION );
}

function wsub_maybe_upgrade() {
    if ( get_option( 'wsub_db_version' ) !== WSUB_DB_VERSION ) {
        wsub_install();
    }
}

function wsub_now() {
    return current_time( 'mysql', true );
}

function wsub_new_token() {
    return wp_generate_password( 32, false, false );
}

function wsub_get_by_email( $email ) {
    global $wpdb;
    return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . wsub_table() . ' WHERE email = %s', $email ) );
}

function wsub_get_by_token( $token ) {
    global $wpdb;
    if ( ! is_string( $token ) || 32 !== strlen( $token ) ) {
        return null;
    }
    return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . wsub_table() . ' WHERE token = %s', $token ) );
}

/**
 * Add or re-activate a subscriber.
 *
 * @return array{ status: string, row: object|null } status is one of
 *               'pending', 'active', 'already', 'error'.
 */
function wsub_add( $email, $source = '', $double_opt_in = true ) {
    global $wpdb;

    $email = strtolower( trim( $email ) );
    if ( ! is_email( $email ) ) {
        return array( 'status' => 'error', 'row' => null );
    }

    $existing = wsub_get_by_email( $email );
    $status   = $double_opt_in ? 'pending' : 'active';

    if ( $existing && 'active' === $existing->status ) {
        return array( 'status' => 'already', 'row' => $existing );
    }

    if ( $existing ) {
        // Pending or unsubscribed: start over with a fresh token.
        $wpdb->update(
            wsub_table(),
            array(
                'status'          => $status,
                'token'           => wsub_new_token(),
                'source'          => '' !== (string) $source ? substr( (string) $source, 0, 100 ) : $existing->source,
                'confirmed_at'    => $double_opt_in ? null : wsub_now(),
                'unsubscribed_at' => null,
            ),
            array( 'id' => $existing->id )
        );
    } else {
        $inserted = $wpdb->insert(
            wsub_table(),
            array(
                'email'        => $email,
                'status'       => $status,
                'token'        => wsub_new_token(),
                'source'       => substr( (string) $source, 0, 100 ),
                'created_at'   => wsub_now(),
                'confirmed_at' => $double_opt_in ? null : wsub_now(),
            )
        );
        if ( ! $inserted ) {
            return array( 'status' => 'error', 'row' => null );
        }
    }

    $row = wsub_get_by_email( $email );

    if ( 'active' === $status ) {
        do_action( 'wsub_subscribed', $row );
    }

    return array( 'status' => $status, 'row' => $row );
}

function wsub_confirm( $row ) {
    global $wpdb;
    if ( 'active' === $row->status ) {
        return;
    }
    $wpdb->update(
        wsub_table(),
        array( 'status' => 'active', 'confirmed_at' => wsub_now(), 'unsubscribed_at' => null ),
        array( 'id' => $row->id )
    );
    do_action( 'wsub_subscribed', wsub_get_by_email( $row->email ) );
}

function wsub_unsubscribe( $row ) {
    global $wpdb;
    $wpdb->update(
        wsub_table(),
        array( 'status' => 'unsubscribed', 'unsubscribed_at' => wsub_now() ),
        array( 'id' => $row->id )
    );
    do_action( 'wsub_unsubscribed', $row );
}

function wsub_delete( $id ) {
    global $wpdb;
    return (bool) $wpdb->delete( wsub_table(), array( 'id' => (int) $id ) );
}

/**
 * Subscriber counts by status, plus 'all'.
 */
function wsub_counts() {
    global $wpdb;
    $counts = array( 'all' => 0, 'active' => 0, 'pending' => 0, 'unsubscribed' => 0 );
    $rows   = $wpdb->get_results( 'SELECT status, COUNT(*) AS n FROM ' . wsub_table() . ' GROUP BY status' );
    foreach ( $rows as $r ) {
        $counts[ $r->status ] = (int) $r->n;
        $counts['all']       += (int) $r->n;
    }
    return $counts;
}

/**
 * Build the WHERE clause shared by the admin list and the export.
 */
function wsub_where( $status = '', $search = '' ) {
    global $wpdb;
    $where = array( '1=1' );
    if ( in_array( $status, array( 'active', 'pending', 'unsubscribed' ), true ) ) {
        $where[] = $wpdb->prepare( 'status = %s', $status );
    }
    if ( '' !== $search ) {
        $where[] = $wpdb->prepare( 'email LIKE %s', '%' . $wpdb->esc_like( $search ) . '%' );
    }
    return implode( ' AND ', $where );
}

function wsub_query( $args = array() ) {
    global $wpdb;
    $args = wp_parse_args(
        $args,
        array( 'status' => '', 'search' => '', 'per_page' => 50, 'page' => 1 )
    );

    $where  = wsub_where( $args['status'], $args['search'] );
    $limit  = max( 1, (int) $args['per_page'] );
    $offset = ( max( 1, (int) $args['page'] ) - 1 ) * $limit;
    $table  = wsub_table();

    return array(
        'items' => $wpdb->get_results( "SELECT * FROM {$table} WHERE {$where} ORDER BY id DESC LIMIT {$offset}, {$limit}" ),
        'total' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE {$where}" ),
    );
}

function wsub_confirm_url( $row ) {
    return add_query_arg( 'wsub_confirm', $row->token, home_url( '/' ) );
}

function wsub_unsubscribe_url( $row ) {
    return add_query_arg( 'wsub_unsubscribe', $row->token, home_url( '/' ) );
}
