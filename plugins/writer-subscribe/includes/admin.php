<?php
/**
 * Admin: subscriber list, settings and CSV export.
 */

defined( 'ABSPATH' ) || exit;

define( 'WSUB_PAGE', 'writer-subscribe' );

/**
 * Who may see and export the list. It is personal data, so admins by default.
 */
function wsub_capability() {
    return apply_filters( 'wsub_capability', 'manage_options' );
}

function wsub_admin_url( $args = array() ) {
    return add_query_arg( $args, admin_url( 'admin.php?page=' . WSUB_PAGE ) );
}

add_action( 'admin_menu', function () {
    add_menu_page(
        __( 'Subscribers', 'writer-subscribe' ),
        __( 'Subscribers', 'writer-subscribe' ),
        wsub_capability(),
        WSUB_PAGE,
        'wsub_render_admin',
        'dashicons-email-alt',
        26
    );
} );

// Link from the WordPress for Writers sidebar, when that plugin is active.
add_filter( 'wfw_sidebar_links', function ( $links ) {
    if ( current_user_can( wsub_capability() ) ) {
        $counts  = wsub_counts();
        $links[] = array(
            'label' => sprintf( __( 'Subscribers (%s)', 'writer-subscribe' ), number_format_i18n( $counts['active'] ) ),
            'url'   => wsub_admin_url(),
        );
    }
    return $links;
} );

add_filter( 'plugin_action_links_' . plugin_basename( WSUB_FILE ), function ( $links ) {
    array_unshift( $links, '<a href="' . esc_url( wsub_admin_url( array( 'tab' => 'settings' ) ) ) . '">' . esc_html__( 'Settings', 'writer-subscribe' ) . '</a>' );
    return $links;
} );

/* ------------------------------------------------------------------------
 * Actions
 * --------------------------------------------------------------------- */

add_action( 'admin_post_wsub_delete', function () {
    if ( ! current_user_can( wsub_capability() ) ) {
        wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'writer-subscribe' ), 403 );
    }
    $id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
    check_admin_referer( 'wsub_delete_' . $id );
    wsub_delete( $id );
    wp_safe_redirect( add_query_arg( 'wsub_msg', 'deleted', wp_get_referer() ? wp_get_referer() : wsub_admin_url() ) );
    exit;
} );

add_action( 'admin_post_wsub_add', function () {
    if ( ! current_user_can( wsub_capability() ) ) {
        wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'writer-subscribe' ), 403 );
    }
    check_admin_referer( 'wsub_add' );
    $email  = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
    $result = wsub_add( $email, 'admin', false );
    $msg    = 'error' === $result['status'] ? 'add_error' : 'added';
    if ( 'already' === $result['status'] ) {
        $msg = 'already';
    }
    wp_safe_redirect( wsub_admin_url( array( 'wsub_msg' => $msg ) ) );
    exit;
} );

/**
 * Neutralise spreadsheet formulas (=, +, -, @) in exported cells.
 */
function wsub_csv_cell( $value ) {
    $value = (string) $value;
    if ( '' !== $value && false !== strpos( "=+-@\t\r", $value[0] ) ) {
        return "'" . $value;
    }
    return $value;
}

/**
 * Stream the list as CSV. Reads in id-ordered batches and writes straight to
 * the response, so memory use stays flat however big the list is.
 */
add_action( 'admin_post_wsub_export', function () {
    global $wpdb;

    if ( ! current_user_can( wsub_capability() ) ) {
        wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'writer-subscribe' ), 403 );
    }
    check_admin_referer( 'wsub_export' );

    $status = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : '';
    $search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
    $where  = wsub_where( $status, $search );
    $table  = wsub_table();
    $batch  = (int) apply_filters( 'wsub_export_batch_size', 5000 );

    if ( function_exists( 'set_time_limit' ) ) {
        @set_time_limit( 0 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
    }
    while ( ob_get_level() ) {
        ob_end_clean();
    }

    $filename = sprintf( '%s-subscribers-%s%s.csv', sanitize_title( get_bloginfo( 'name' ) ), $status ? $status . '-' : '', gmdate( 'Y-m-d' ) );

    nocache_headers();
    header( 'Content-Type: text/csv; charset=utf-8' );
    header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
    header( 'X-Accel-Buffering: no' );

    $out = fopen( 'php://output', 'w' );
    fputcsv( $out, array( 'email', 'status', 'source', 'subscribed_at', 'confirmed_at', 'unsubscribed_at' ) );

    $last = 0;
    do {
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, email, status, source, created_at, confirmed_at, unsubscribed_at FROM {$table} WHERE {$where} AND id > %d ORDER BY id ASC LIMIT %d", // phpcs:ignore WordPress.DB.PreparedSQL
                $last,
                $batch
            ),
            ARRAY_A
        );
        foreach ( $rows as $row ) {
            $last = (int) $row['id'];
            fputcsv(
                $out,
                array(
                    wsub_csv_cell( $row['email'] ),
                    $row['status'],
                    wsub_csv_cell( $row['source'] ),
                    $row['created_at'],
                    (string) $row['confirmed_at'],
                    (string) $row['unsubscribed_at'],
                )
            );
        }
        $count = count( $rows );
        unset( $rows );
        $wpdb->flush();
        flush();
    } while ( $count === $batch );

    fclose( $out );
    exit;
} );

/* ------------------------------------------------------------------------
 * Screens
 * --------------------------------------------------------------------- */

function wsub_render_admin() {
    $tab = isset( $_GET['tab'] ) && 'settings' === $_GET['tab'] ? 'settings' : 'list'; // phpcs:ignore WordPress.Security.NonceVerification
    ?>
    <div class="wrap">
        <h1 class="wp-heading-inline"><?php esc_html_e( 'Subscribers', 'writer-subscribe' ); ?></h1>
        <nav class="nav-tab-wrapper">
            <a class="nav-tab <?php echo 'list' === $tab ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url( wsub_admin_url() ); ?>"><?php esc_html_e( 'List', 'writer-subscribe' ); ?></a>
            <a class="nav-tab <?php echo 'settings' === $tab ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url( wsub_admin_url( array( 'tab' => 'settings' ) ) ); ?>"><?php esc_html_e( 'Settings', 'writer-subscribe' ); ?></a>
        </nav>
        <?php
        if ( 'settings' === $tab ) {
            wsub_render_settings();
        } else {
            wsub_render_list();
        }
        ?>
    </div>
    <?php
}

function wsub_render_list() {
    // phpcs:disable WordPress.Security.NonceVerification -- read-only filters.
    $status = isset( $_GET['status'] ) ? sanitize_key( $_GET['status'] ) : '';
    $search = isset( $_GET['s'] ) ? sanitize_text_field( wp_unslash( $_GET['s'] ) ) : '';
    $paged  = isset( $_GET['paged'] ) ? max( 1, absint( $_GET['paged'] ) ) : 1;
    $msg    = isset( $_GET['wsub_msg'] ) ? sanitize_key( $_GET['wsub_msg'] ) : '';
    // phpcs:enable

    $per    = 50;
    $counts = wsub_counts();
    $result = wsub_query( array( 'status' => $status, 'search' => $search, 'page' => $paged, 'per_page' => $per ) );
    $pages  = (int) ceil( $result['total'] / $per );

    $messages = array(
        'deleted'   => __( 'Subscriber deleted.', 'writer-subscribe' ),
        'added'     => __( 'Subscriber added.', 'writer-subscribe' ),
        'already'   => __( 'That address is already subscribed.', 'writer-subscribe' ),
        'add_error' => __( 'That doesn’t look like a valid email address.', 'writer-subscribe' ),
    );
    if ( isset( $messages[ $msg ] ) ) {
        printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', 'add_error' === $msg ? 'error' : 'success', esc_html( $messages[ $msg ] ) );
    }

    $labels = array(
        ''             => __( 'All', 'writer-subscribe' ),
        'active'       => __( 'Active', 'writer-subscribe' ),
        'pending'      => __( 'Pending', 'writer-subscribe' ),
        'unsubscribed' => __( 'Unsubscribed', 'writer-subscribe' ),
    );

    $export_url = wp_nonce_url(
        add_query_arg( array_filter( array( 'action' => 'wsub_export', 'status' => $status, 's' => $search ) ), admin_url( 'admin-post.php' ) ),
        'wsub_export'
    );
    ?>
    <ul class="subsubsub">
        <?php
        $links = array();
        foreach ( $labels as $key => $label ) {
            $n       = $counts[ '' === $key ? 'all' : $key ];
            $links[] = sprintf(
                '<li><a href="%s" class="%s">%s <span class="count">(%s)</span></a>',
                esc_url( wsub_admin_url( array_filter( array( 'status' => $key ) ) ) ),
                $status === $key ? 'current' : '',
                esc_html( $label ),
                esc_html( number_format_i18n( $n ) )
            );
        }
        echo implode( ' | </li>', $links ) . '</li>'; // phpcs:ignore WordPress.Security.EscapeOutput
        ?>
    </ul>

    <form method="get" class="search-form" style="float:right;margin:8px 0">
        <input type="hidden" name="page" value="<?php echo esc_attr( WSUB_PAGE ); ?>">
        <?php if ( $status ) : ?>
            <input type="hidden" name="status" value="<?php echo esc_attr( $status ); ?>">
        <?php endif; ?>
        <label class="screen-reader-text" for="wsub-search"><?php esc_html_e( 'Search subscribers', 'writer-subscribe' ); ?></label>
        <input type="search" id="wsub-search" name="s" value="<?php echo esc_attr( $search ); ?>">
        <button class="button"><?php esc_html_e( 'Search', 'writer-subscribe' ); ?></button>
    </form>

    <div class="tablenav top" style="clear:both">
        <div class="alignleft actions">
            <a class="button button-primary" href="<?php echo esc_url( $export_url ); ?>">
                <?php
                printf(
                    /* translators: %s: number of rows */
                    esc_html__( 'Export CSV (%s)', 'writer-subscribe' ),
                    esc_html( number_format_i18n( $result['total'] ) )
                );
                ?>
            </a>
        </div>
        <form class="alignleft actions" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="wsub_add">
            <?php wp_nonce_field( 'wsub_add' ); ?>
            <label class="screen-reader-text" for="wsub-add"><?php esc_html_e( 'Email address', 'writer-subscribe' ); ?></label>
            <input type="email" id="wsub-add" name="email" required placeholder="<?php esc_attr_e( 'Add an email', 'writer-subscribe' ); ?>">
            <button class="button"><?php esc_html_e( 'Add', 'writer-subscribe' ); ?></button>
        </form>
        <?php wsub_pagination( $paged, $pages, $result['total'] ); ?>
    </div>

    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th scope="col" style="width:40%"><?php esc_html_e( 'Email', 'writer-subscribe' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Status', 'writer-subscribe' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Source', 'writer-subscribe' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Subscribed', 'writer-subscribe' ); ?></th>
            </tr>
        </thead>
        <tbody>
        <?php if ( ! $result['items'] ) : ?>
            <tr><td colspan="4"><?php esc_html_e( 'No subscribers yet. Turn on the popup in Settings or add the Subscribe form block to a page.', 'writer-subscribe' ); ?></td></tr>
        <?php endif; ?>
        <?php foreach ( $result['items'] as $row ) : ?>
            <tr>
                <td>
                    <strong><?php echo esc_html( $row->email ); ?></strong>
                    <div class="row-actions">
                        <span class="delete"><a class="submitdelete" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wsub_delete&id=' . $row->id ), 'wsub_delete_' . $row->id ) ); ?>" onclick="return confirm('<?php echo esc_js( __( 'Delete this subscriber permanently?', 'writer-subscribe' ) ); ?>')"><?php esc_html_e( 'Delete', 'writer-subscribe' ); ?></a></span>
                    </div>
                </td>
                <td><?php echo esc_html( $labels[ $row->status ] ?? $row->status ); ?></td>
                <td><?php echo esc_html( wsub_source_label( $row->source ) ); ?></td>
                <td><?php echo esc_html( get_date_from_gmt( $row->created_at, get_option( 'date_format' ) ) ); ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <div class="tablenav bottom"><?php wsub_pagination( $paged, $pages, $result['total'] ); ?></div>
    <?php
}

/**
 * "popup:123" → "Popup on “Post title”".
 */
function wsub_source_label( $source ) {
    if ( preg_match( '/^popup:(\d+)$/', $source, $m ) ) {
        $title = get_the_title( (int) $m[1] );
        return $title ? sprintf( __( 'Popup on “%s”', 'writer-subscribe' ), $title ) : __( 'Popup', 'writer-subscribe' );
    }
    $known = array(
        'inline' => __( 'Form', 'writer-subscribe' ),
        'block'  => __( 'Form', 'writer-subscribe' ),
        'admin'  => __( 'Added by hand', 'writer-subscribe' ),
        'import' => __( 'Import', 'writer-subscribe' ),
    );
    return $known[ $source ] ?? $source;
}

function wsub_pagination( $paged, $pages, $total ) {
    echo '<div class="tablenav-pages">';
    printf( '<span class="displaying-num">%s</span> ', esc_html( sprintf( _n( '%s item', '%s items', $total, 'writer-subscribe' ), number_format_i18n( $total ) ) ) );
    if ( $pages > 1 ) {
        echo wp_kses_post(
            paginate_links(
                array(
                    'base'    => add_query_arg( 'paged', '%#%' ),
                    'format'  => '',
                    'current' => $paged,
                    'total'   => $pages,
                )
            )
        );
    }
    echo '</div>';
}

function wsub_render_settings() {
    $s = wsub_settings();
    ?>
    <form method="post" action="options.php">
        <?php settings_fields( 'wsub_settings' ); ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><?php esc_html_e( 'Popup', 'writer-subscribe' ); ?></th>
                <td>
                    <label><input type="checkbox" name="wsub_settings[popup]" value="1" <?php checked( $s['popup'] ); ?>> <?php esc_html_e( 'Show a subscribe popup on posts', 'writer-subscribe' ); ?></label>
                    <p class="description"><?php esc_html_e( 'Never shown to people who already subscribed from this browser, or to logged-in writers.', 'writer-subscribe' ); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-scroll"><?php esc_html_e( 'Show after scrolling', 'writer-subscribe' ); ?></label></th>
                <td><input id="wsub-scroll" class="small-text" type="number" min="0" max="100" name="wsub_settings[scroll]" value="<?php echo esc_attr( $s['scroll'] ); ?>"> % <?php esc_html_e( 'of the post', 'writer-subscribe' ); ?></td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-snooze"><?php esc_html_e( 'After closing, hide for', 'writer-subscribe' ); ?></label></th>
                <td><input id="wsub-snooze" class="small-text" type="number" min="0" max="365" name="wsub_settings[snooze_days]" value="<?php echo esc_attr( $s['snooze_days'] ); ?>"> <?php esc_html_e( 'days', 'writer-subscribe' ); ?></td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-heading"><?php esc_html_e( 'Heading', 'writer-subscribe' ); ?></label></th>
                <td><input id="wsub-heading" class="regular-text" type="text" name="wsub_settings[heading]" value="<?php echo esc_attr( $s['heading'] ); ?>"></td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-text"><?php esc_html_e( 'Text', 'writer-subscribe' ); ?></label></th>
                <td><textarea id="wsub-text" class="large-text" rows="2" name="wsub_settings[text]"><?php echo esc_textarea( $s['text'] ); ?></textarea></td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-button"><?php esc_html_e( 'Button label', 'writer-subscribe' ); ?></label></th>
                <td><input id="wsub-button" class="regular-text" type="text" name="wsub_settings[button]" value="<?php echo esc_attr( $s['button'] ); ?>"></td>
            </tr>
            <tr>
                <th scope="row"><label for="wsub-consent"><?php esc_html_e( 'Consent checkbox', 'writer-subscribe' ); ?></label></th>
                <td>
                    <input id="wsub-consent" class="large-text" type="text" name="wsub_settings[consent]" value="<?php echo esc_attr( $s['consent'] ); ?>" placeholder="<?php esc_attr_e( 'I agree to receive emails and accept the privacy policy.', 'writer-subscribe' ); ?>">
                    <p class="description"><?php esc_html_e( 'Leave empty for no checkbox.', 'writer-subscribe' ); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e( 'Double opt-in', 'writer-subscribe' ); ?></th>
                <td>
                    <label><input type="checkbox" name="wsub_settings[double_opt_in]" value="1" <?php checked( $s['double_opt_in'] ); ?>> <?php esc_html_e( 'Email a confirmation link before adding someone', 'writer-subscribe' ); ?></label>
                    <p class="description"><?php esc_html_e( 'Recommended. Keeps typos and fake addresses off your list. Needs working email on this site.', 'writer-subscribe' ); ?></p>
                </td>
            </tr>
        </table>
        <p class="description"><?php esc_html_e( 'Place a form anywhere with the Subscribe form block or the [writer_subscribe] shortcode.', 'writer-subscribe' ); ?></p>
        <?php submit_button(); ?>
    </form>
    <?php
}
