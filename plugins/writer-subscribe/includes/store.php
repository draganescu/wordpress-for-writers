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
        token_at datetime NULL DEFAULT NULL,
        source varchar(100) NOT NULL DEFAULT '',
        created_at datetime NOT NULL,
        confirmed_at datetime NULL DEFAULT NULL,
        unsubscribed_at datetime NULL DEFAULT NULL,
        consented_at datetime NULL DEFAULT NULL,
        consent_text text NULL,
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

/* ------------------------------------------------------------------------
 * Retention
 *
 * A pending row is someone who never consented, so it is removed once its
 * confirmation window has passed. Unsubscribed rows are kept on purpose:
 * they are the suppression list that stops an address from being re-added
 * without a fresh confirmation, and that tells you not to import it into an
 * email service again. Erase one with Tools > Erase Personal Data.
 * --------------------------------------------------------------------- */

/**
 * Make sure the daily purge is scheduled. Runs on every load, not only on
 * activation, so sites in a network-activated install and sites upgraded
 * without reactivating get it too.
 */
function wsub_schedule_purge() {
    if ( ! wp_next_scheduled( 'wsub_purge' ) ) {
        wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wsub_purge' );
    }
}

function wsub_activate() {
    wsub_install();
    wsub_schedule_purge();
}

function wsub_deactivate() {
    wp_clear_scheduled_hook( 'wsub_purge' );
}

/**
 * How long an unconfirmed signup is kept, in seconds. Never shorter than the
 * confirmation window, so a link in someone's inbox keeps working.
 */
function wsub_pending_retention() {
    $ttl = wsub_confirm_ttl();
    return max( $ttl, (int) apply_filters( 'wsub_pending_retention', $ttl ) );
}

/**
 * Remove expired pending signups. A pending row that had unsubscribed
 * before (someone, maybe a stranger, tried to re-add the address) goes back
 * to unsubscribed instead, so the suppression record is not lost.
 *
 * @return int Rows deleted or reverted.
 */
function wsub_purge_pending() {
    global $wpdb;
    $table  = wsub_table();
    $cutoff = gmdate( 'Y-m-d H:i:s', time() - wsub_pending_retention() );

    $reverted = $wpdb->query(
        $wpdb->prepare(
            "UPDATE {$table} SET status = 'unsubscribed' WHERE status = 'pending' AND unsubscribed_at IS NOT NULL AND COALESCE(token_at, created_at) < %s", // phpcs:ignore WordPress.DB.PreparedSQL
            $cutoff
        )
    );
    $deleted = $wpdb->query(
        $wpdb->prepare(
            "DELETE FROM {$table} WHERE status = 'pending' AND unsubscribed_at IS NULL AND COALESCE(token_at, created_at) < %s", // phpcs:ignore WordPress.DB.PreparedSQL
            $cutoff
        )
    );
    return (int) $reverted + (int) $deleted;
}
add_action( 'wsub_purge', 'wsub_purge_pending' );
add_action( 'init', 'wsub_schedule_purge' );

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

/**
 * Seconds since the row's current token was issued, or null when unknown.
 */
function wsub_token_age( $row ) {
    if ( empty( $row->token_at ) ) {
        return null;
    }
    $issued = strtotime( $row->token_at . ' UTC' );
    return $issued ? max( 0, time() - $issued ) : null;
}

/**
 * How long an unconfirmed signup link stays valid.
 */
function wsub_confirm_ttl() {
    return (int) apply_filters( 'wsub_confirm_ttl', 7 * DAY_IN_SECONDS );
}

/**
 * Look a row up by token. A pending row's token stops working once its
 * confirmation window has passed; an active row's token keeps serving its
 * unsubscribe link.
 */
function wsub_get_by_token( $token ) {
    global $wpdb;
    if ( ! is_string( $token ) || 32 !== strlen( $token ) ) {
        return null;
    }
    $row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . wsub_table() . ' WHERE token = %s', $token ) );
    if ( $row && 'pending' === $row->status ) {
        $age = wsub_token_age( $row );
        if ( null !== $age && $age > wsub_confirm_ttl() ) {
            return null;
        }
    }
    return $row;
}

/**
 * Add or re-activate a subscriber.
 *
 * @param string $consent The consent text the person agreed to, when the form
 *                        showed a consent checkbox. Stored with the time as
 *                        proof of consent.
 * @param bool $public True when the request comes from a visitor rather than
 *                     an admin. Public requests can never re-activate someone
 *                     who unsubscribed without a fresh confirmation, whatever
 *                     the double-opt-in setting says.
 *
 * @return array{ status: string, row: object|null } status is one of
 *               'pending' (confirmation needed, send the email),
 *               'cooldown' (confirmation already sent recently, don't resend),
 *               'active', 'already', 'error'.
 */
function wsub_add( $email, $source = '', $double_opt_in = true, $public = true, $consent = '' ) {
    global $wpdb;

    $email = strtolower( trim( $email ) );
    if ( ! is_email( $email ) || strlen( $email ) > 190 ) {
        return array( 'status' => 'error', 'row' => null );
    }

    $existing = wsub_get_by_email( $email );

    if ( $existing && 'active' === $existing->status ) {
        return array( 'status' => 'already', 'row' => $existing );
    }

    if ( $public && $existing && 'unsubscribed' === $existing->status ) {
        $double_opt_in = true;
    }

    // Don't resend (and don't invalidate the link already in their inbox)
    // while a recent confirmation is still outstanding. This is also what
    // stops a stranger from using the form to flood someone with email.
    if ( $existing && 'pending' === $existing->status && $double_opt_in ) {
        $age = wsub_token_age( $existing );
        if ( null !== $age && $age < (int) apply_filters( 'wsub_resend_cooldown', 10 * MINUTE_IN_SECONDS ) ) {
            return array( 'status' => 'cooldown', 'row' => $existing );
        }
    }

    $status = $double_opt_in ? 'pending' : 'active';
    $fields = array(
        'status'          => $status,
        'token'           => wsub_new_token(),
        'token_at'        => wsub_now(),
        'source'          => substr( (string) $source, 0, 100 ),
        'confirmed_at'    => $double_opt_in ? null : wsub_now(),
        // Keep the unsubscribe date on a pending re-signup: if it is never
        // confirmed, the purge turns it back into an unsubscribed row.
        'unsubscribed_at' => ( $double_opt_in && $existing ) ? $existing->unsubscribed_at : null,
        'consented_at'    => '' !== $consent ? wsub_now() : null,
        'consent_text'    => '' !== $consent ? $consent : null,
    );

    if ( $existing ) {
        if ( '' === $fields['source'] ) {
            $fields['source'] = $existing->source;
        }
        $wpdb->update( wsub_table(), $fields, array( 'id' => $existing->id ) );
    } else {
        $fields['email']      = $email;
        $fields['created_at'] = wsub_now();
        if ( ! $wpdb->insert( wsub_table(), $fields ) ) {
            return array( 'status' => 'error', 'row' => null );
        }
    }

    $row = wsub_get_by_email( $email );
    if ( ! $row ) {
        return array( 'status' => 'error', 'row' => null );
    }

    if ( 'active' === $status ) {
        do_action( 'wsub_subscribed', $row );
    }

    return array( 'status' => $status, 'row' => $row );
}

/**
 * Confirm a pending row. The confirmation token is single-use: a new one
 * is issued for the unsubscribe link.
 */
function wsub_confirm( $row ) {
    global $wpdb;
    if ( 'active' === $row->status ) {
        return;
    }
    $wpdb->update(
        wsub_table(),
        array(
            'status'          => 'active',
            'token'           => wsub_new_token(),
            'token_at'        => wsub_now(),
            'confirmed_at'    => wsub_now(),
            'unsubscribed_at' => null,
        ),
        array( 'id' => $row->id )
    );
    do_action( 'wsub_subscribed', wsub_get_by_email( $row->email ) );
}

function wsub_unsubscribe( $row ) {
    global $wpdb;
    $wpdb->update(
        wsub_table(),
        array(
            'status'          => 'unsubscribed',
            'token'           => wsub_new_token(),
            'token_at'        => wsub_now(),
            'unsubscribed_at' => wsub_now(),
        ),
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
