<?php
/**
 * Admin: members by tier, tier list, settings, and the tier field on user profiles.
 */

defined( 'ABSPATH' ) || exit;

define( 'WMEM_PAGE', 'writer-members' );

/**
 * Who may manage tiers and members. Member lists are personal data, so admins by default.
 */
function wmem_capability() {
    return apply_filters( 'wmem_capability', 'manage_options' );
}

function wmem_admin_url( $args = array() ) {
    return add_query_arg( $args, admin_url( 'admin.php?page=' . WMEM_PAGE ) );
}

add_action( 'admin_menu', function () {
    add_menu_page(
        __( 'Members', 'writer-members' ),
        __( 'Members', 'writer-members' ),
        wmem_capability(),
        WMEM_PAGE,
        'wmem_render_admin',
        'dashicons-groups',
        27
    );
} );

/**
 * Member counts per tier slug, plus 'all'.
 */
function wmem_counts() {
    global $wpdb;
    $rows   = $wpdb->get_results( $wpdb->prepare( "SELECT meta_value AS tier, COUNT(*) AS n FROM {$wpdb->usermeta} WHERE meta_key = %s GROUP BY meta_value", 'wmem_tier' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
    $counts = array( 'all' => 0 );
    foreach ( $rows as $row ) {
        $counts[ $row->tier ] = (int) $row->n;
        $counts['all']       += (int) $row->n;
    }
    return $counts;
}

// Link from the WordPress for Writers sidebar, when that plugin is active.
add_filter( 'wfw_sidebar_links', function ( $links ) {
    if ( current_user_can( wmem_capability() ) ) {
        $counts  = wmem_counts();
        $links[] = array(
            /* translators: %s: number of members */
            'label' => sprintf( __( 'Members (%s)', 'writer-members' ), number_format_i18n( $counts['all'] ) ),
            'url'   => wmem_admin_url(),
        );
    }
    return $links;
} );

// The Visibility picker in the WordPress for Writers editor.
add_filter( 'wfw_visibility_options', function ( $options ) {
    foreach ( wmem_tiers() as $tier ) {
        $options[] = array( 'value' => $tier['slug'], 'label' => $tier['name'] );
    }
    return $options;
} );

add_filter( 'plugin_action_links_' . plugin_basename( WMEM_FILE ), function ( $links ) {
    array_unshift( $links, '<a href="' . esc_url( wmem_admin_url( array( 'tab' => 'settings' ) ) ) . '">' . esc_html__( 'Settings', 'writer-members' ) . '</a>' );
    return $links;
} );

/* ------------------------------------------------------------------------
 * Actions
 * --------------------------------------------------------------------- */

function wmem_check_admin_action( $nonce ) {
    if ( ! current_user_can( wmem_capability() ) ) {
        wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'writer-members' ), 403 );
    }
    check_admin_referer( $nonce );
}

function wmem_posted_tier() {
    $slug = isset( $_POST['tier'] ) ? sanitize_key( wp_unslash( $_POST['tier'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
    return '' === $slug || wmem_tier( $slug ) ? $slug : null;
}

add_action( 'admin_post_wmem_set_tier', function () {
    $user_id = isset( $_POST['user_id'] ) ? absint( $_POST['user_id'] ) : 0;
    wmem_check_admin_action( 'wmem_set_tier_' . $user_id );
    $slug = wmem_posted_tier();
    if ( $user_id && null !== $slug && get_userdata( $user_id ) ) {
        wmem_set_user_tier( $user_id, $slug );
    }
    wp_safe_redirect( add_query_arg( 'wmem_msg', 'updated', wp_get_referer() ? wp_get_referer() : wmem_admin_url() ) );
    exit;
} );

add_action( 'admin_post_wmem_add', function () {
    wmem_check_admin_action( 'wmem_add' );
    $email = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
    $slug  = wmem_posted_tier();
    if ( ! is_email( $email ) || ! $slug ) {
        wp_safe_redirect( wmem_admin_url( array( 'wmem_msg' => 'add_error' ) ) );
        exit;
    }
    $user_id = wmem_find_or_create_member( $email );
    if ( is_wp_error( $user_id ) ) {
        wp_safe_redirect( wmem_admin_url( array( 'wmem_msg' => 'add_error' ) ) );
        exit;
    }
    wmem_set_user_tier( $user_id, $slug );
    wp_safe_redirect( wmem_admin_url( array( 'wmem_msg' => 'added' ) ) );
    exit;
} );

/* ------------------------------------------------------------------------
 * Screens
 * --------------------------------------------------------------------- */

function wmem_render_admin() {
    // phpcs:ignore WordPress.Security.NonceVerification
    $tab  = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'members';
    $tabs = array(
        'members'  => __( 'Members', 'writer-members' ),
        'tiers'    => __( 'Tiers', 'writer-members' ),
        'settings' => __( 'Settings', 'writer-members' ),
    );
    $tab  = isset( $tabs[ $tab ] ) ? $tab : 'members';
    ?>
    <div class="wrap">
        <h1 class="wp-heading-inline"><?php esc_html_e( 'Members', 'writer-members' ); ?></h1>
        <nav class="nav-tab-wrapper">
            <?php foreach ( $tabs as $key => $label ) : ?>
                <a class="nav-tab <?php echo $tab === $key ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url( wmem_admin_url( 'members' === $key ? array() : array( 'tab' => $key ) ) ); ?>"><?php echo esc_html( $label ); ?></a>
            <?php endforeach; ?>
        </nav>
        <?php
        if ( 'tiers' === $tab ) {
            wmem_render_tiers();
        } elseif ( 'settings' === $tab ) {
            wmem_render_settings();
        } else {
            wmem_render_members();
        }
        ?>
    </div>
    <?php
}

function wmem_tier_select( $name, $selected, $with_none = true, $id = '' ) {
    $html = sprintf( '<select name="%s"%s>', esc_attr( $name ), $id ? ' id="' . esc_attr( $id ) . '"' : '' );
    if ( $with_none ) {
        $html .= '<option value="">' . esc_html__( '— No tier —', 'writer-members' ) . '</option>';
    }
    foreach ( wmem_tiers() as $tier ) {
        $html .= sprintf( '<option value="%s"%s>%s</option>', esc_attr( $tier['slug'] ), selected( $selected, $tier['slug'], false ), esc_html( $tier['name'] ) );
    }
    return $html . '</select>';
}

function wmem_render_members() {
    // phpcs:disable WordPress.Security.NonceVerification -- read-only filters.
    $tier  = isset( $_GET['tier'] ) ? sanitize_key( $_GET['tier'] ) : '';
    $paged = isset( $_GET['paged'] ) ? max( 1, absint( $_GET['paged'] ) ) : 1;
    $msg   = isset( $_GET['wmem_msg'] ) ? sanitize_key( $_GET['wmem_msg'] ) : '';
    // phpcs:enable

    $per    = 50;
    $counts = wmem_counts();
    $args   = array(
        'meta_key'    => 'wmem_tier',
        'number'      => $per,
        'paged'       => $paged,
        'orderby'     => 'registered',
        'order'       => 'DESC',
        'count_total' => true,
    );
    if ( $tier ) {
        $args['meta_value'] = $tier;
    }
    $query  = new WP_User_Query( $args );
    $total = (int) $query->get_total();
    $pages = (int) ceil( $total / $per );

    $messages = array(
        'updated'   => __( 'Member updated.', 'writer-members' ),
        'added'     => __( 'Member added.', 'writer-members' ),
        'add_error' => __( 'Enter a valid email address and pick a tier.', 'writer-members' ),
    );
    if ( isset( $messages[ $msg ] ) ) {
        printf( '<div class="notice notice-%s is-dismissible"><p>%s</p></div>', 'add_error' === $msg ? 'error' : 'success', esc_html( $messages[ $msg ] ) );
    }

    $filters = array( '' => __( 'All', 'writer-members' ) );
    foreach ( wmem_tiers() as $t ) {
        $filters[ $t['slug'] ] = $t['name'];
    }
    ?>
    <ul class="subsubsub">
        <?php
        $links = array();
        foreach ( $filters as $key => $label ) {
            $links[] = sprintf(
                '<li><a href="%s" class="%s">%s <span class="count">(%s)</span></a>',
                esc_url( wmem_admin_url( array_filter( array( 'tier' => $key ) ) ) ),
                $tier === $key ? 'current' : '',
                esc_html( $label ),
                esc_html( number_format_i18n( $counts[ '' === $key ? 'all' : $key ] ?? 0 ) )
            );
        }
        echo implode( ' | </li>', $links ) . '</li>'; // phpcs:ignore WordPress.Security.EscapeOutput
        ?>
    </ul>

    <div class="tablenav top" style="clear:both">
        <form class="alignleft actions" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
            <input type="hidden" name="action" value="wmem_add">
            <?php wp_nonce_field( 'wmem_add' ); ?>
            <label class="screen-reader-text" for="wmem-add"><?php esc_html_e( 'Email address', 'writer-members' ); ?></label>
            <input type="email" id="wmem-add" name="email" required placeholder="<?php esc_attr_e( 'Add a member by email', 'writer-members' ); ?>">
            <?php echo wmem_tier_select( 'tier', '', false ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
            <button class="button"><?php esc_html_e( 'Add', 'writer-members' ); ?></button>
        </form>
        <?php wmem_pagination( $paged, $pages, $total ); ?>
    </div>

    <table class="wp-list-table widefat fixed striped">
        <thead>
            <tr>
                <th scope="col" style="width:35%"><?php esc_html_e( 'Member', 'writer-members' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Tier', 'writer-members' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Stripe customer', 'writer-members' ); ?></th>
                <th scope="col"><?php esc_html_e( 'Joined', 'writer-members' ); ?></th>
            </tr>
        </thead>
        <tbody>
        <?php if ( ! $query->get_results() ) : ?>
            <tr><td colspan="4"><?php esc_html_e( 'No members yet. Add one above, or connect a Stripe Payment Link to a tier.', 'writer-members' ); ?></td></tr>
        <?php endif; ?>
        <?php foreach ( $query->get_results() as $user ) : ?>
            <tr>
                <td>
                    <strong><?php echo esc_html( $user->user_email ); ?></strong>
                    <?php if ( $user->display_name && $user->display_name !== $user->user_email ) : ?>
                        <br><span class="description"><?php echo esc_html( $user->display_name ); ?></span>
                    <?php endif; ?>
                    <div class="row-actions"><span class="edit"><a href="<?php echo esc_url( get_edit_user_link( $user->ID ) ); ?>"><?php esc_html_e( 'Edit user', 'writer-members' ); ?></a></span></div>
                </td>
                <td>
                    <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                        <input type="hidden" name="action" value="wmem_set_tier">
                        <input type="hidden" name="user_id" value="<?php echo esc_attr( $user->ID ); ?>">
                        <?php wp_nonce_field( 'wmem_set_tier_' . $user->ID ); ?>
                        <label class="screen-reader-text" for="wmem-tier-<?php echo esc_attr( $user->ID ); ?>"><?php esc_html_e( 'Tier', 'writer-members' ); ?></label>
                        <?php echo wmem_tier_select( 'tier', wmem_user_tier( $user->ID ), true, 'wmem-tier-' . $user->ID ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
                        <button class="button button-small"><?php esc_html_e( 'Change', 'writer-members' ); ?></button>
                    </form>
                </td>
                <td><code><?php echo esc_html( get_user_meta( $user->ID, 'wmem_stripe_customer', true ) ); ?></code></td>
                <td><?php echo esc_html( mysql2date( get_option( 'date_format' ), $user->user_registered ) ); ?></td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
    <div class="tablenav bottom"><?php wmem_pagination( $paged, $pages, $total ); ?></div>
    <?php
}

function wmem_pagination( $paged, $pages, $total ) {
    echo '<div class="tablenav-pages">';
    /* translators: %s: number of members */
    printf( '<span class="displaying-num">%s</span> ', esc_html( sprintf( _n( '%s member', '%s members', $total, 'writer-members' ), number_format_i18n( $total ) ) ) );
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

function wmem_render_tiers() {
    $tiers   = wmem_tiers();
    $tiers[] = array( 'slug' => '', 'name' => '', 'link' => '' ); // Blank row to add one.
    ?>
    <p><?php esc_html_e( 'Tiers go from lowest to highest. A post set to a tier can be read by members of that tier and every tier below it in this list. The first tier is the free one: anyone with an account reads at that tier.', 'writer-members' ); ?></p>
    <form method="post" action="options.php">
        <?php settings_fields( 'wmem_tiers' ); ?>
        <table class="widefat striped" id="wmem-tiers" style="max-width:960px">
            <thead>
                <tr>
                    <th scope="col" style="width:2.5em"></th>
                    <th scope="col"><?php esc_html_e( 'Name', 'writer-members' ); ?></th>
                    <th scope="col"><?php esc_html_e( 'Slug', 'writer-members' ); ?></th>
                    <th scope="col" style="width:40%"><?php esc_html_e( 'Stripe Payment Link', 'writer-members' ); ?></th>
                    <th scope="col"><?php esc_html_e( 'Remove', 'writer-members' ); ?></th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ( $tiers as $i => $tier ) : ?>
                <tr>
                    <td>
                        <button type="button" class="button-link wmem-up" aria-label="<?php esc_attr_e( 'Move up', 'writer-members' ); ?>">↑</button>
                        <button type="button" class="button-link wmem-down" aria-label="<?php esc_attr_e( 'Move down', 'writer-members' ); ?>">↓</button>
                    </td>
                    <td><input type="text" class="regular-text" style="width:100%" name="wmem_tiers[<?php echo (int) $i; ?>][name]" value="<?php echo esc_attr( $tier['name'] ); ?>" placeholder="<?php esc_attr_e( 'Add a tier', 'writer-members' ); ?>" aria-label="<?php esc_attr_e( 'Name', 'writer-members' ); ?>"></td>
                    <td>
                        <?php if ( $tier['slug'] ) : ?>
                            <code><?php echo esc_html( $tier['slug'] ); ?></code>
                            <input type="hidden" name="wmem_tiers[<?php echo (int) $i; ?>][slug]" value="<?php echo esc_attr( $tier['slug'] ); ?>">
                        <?php else : ?>
                            <input type="text" class="small-text" style="width:100%" name="wmem_tiers[<?php echo (int) $i; ?>][slug]" placeholder="<?php esc_attr_e( 'from name', 'writer-members' ); ?>" aria-label="<?php esc_attr_e( 'Slug', 'writer-members' ); ?>">
                        <?php endif; ?>
                    </td>
                    <td><input type="url" style="width:100%" name="wmem_tiers[<?php echo (int) $i; ?>][link]" value="<?php echo esc_attr( $tier['link'] ); ?>" placeholder="https://buy.stripe.com/…" aria-label="<?php esc_attr_e( 'Stripe Payment Link', 'writer-members' ); ?>"></td>
                    <td><?php if ( $tier['slug'] ) : ?><input type="checkbox" name="wmem_tiers[<?php echo (int) $i; ?>][remove]" value="1" aria-label="<?php esc_attr_e( 'Remove', 'writer-members' ); ?>"><?php endif; ?></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
        <p class="description"><?php esc_html_e( 'Slugs are fixed once saved, because posts and members refer to them. Posts set to a removed tier stay closed to everyone but their editors.', 'writer-members' ); ?></p>
        <?php submit_button( __( 'Save tiers', 'writer-members' ) ); ?>
    </form>
    <script>
    // Reorder rows; the form posts them in DOM order, so renumber the field names.
    ( function () {
        var body = document.querySelector( '#wmem-tiers tbody' );
        function renumber() {
            Array.prototype.forEach.call( body.rows, function ( row, i ) {
                row.querySelectorAll( '[name^="wmem_tiers["]' ).forEach( function ( field ) {
                    field.name = field.name.replace( /^wmem_tiers\[\d+\]/, 'wmem_tiers[' + i + ']' );
                } );
            } );
        }
        body.addEventListener( 'click', function ( e ) {
            var row = e.target.closest( 'tr' );
            if ( e.target.classList.contains( 'wmem-up' ) && row.previousElementSibling ) {
                body.insertBefore( row, row.previousElementSibling );
            } else if ( e.target.classList.contains( 'wmem-down' ) && row.nextElementSibling ) {
                body.insertBefore( row.nextElementSibling, row );
            } else {
                return;
            }
            renumber();
        } );
    } )();
    </script>
    <?php
}

function wmem_render_settings() {
    $s = wmem_settings();
    ?>
    <form method="post" action="options.php">
        <?php settings_fields( 'wmem_settings' ); ?>
        <h2><?php esc_html_e( 'Upgrade box', 'writer-members' ); ?></h2>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><label for="wmem-heading"><?php esc_html_e( 'Heading', 'writer-members' ); ?></label></th>
                <td>
                    <input id="wmem-heading" class="regular-text" type="text" name="wmem_settings[heading]" value="<?php echo esc_attr( $s['heading'] ); ?>">
                    <p class="description"><?php esc_html_e( '%s becomes the name of the tier the post needs.', 'writer-members' ); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="wmem-text"><?php esc_html_e( 'Text', 'writer-members' ); ?></label></th>
                <td><textarea id="wmem-text" class="large-text" rows="2" name="wmem_settings[text]"><?php echo esc_textarea( $s['text'] ); ?></textarea></td>
            </tr>
        </table>
        <h2><?php esc_html_e( 'Stripe', 'writer-members' ); ?></h2>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><?php esc_html_e( 'Webhook endpoint', 'writer-members' ); ?></th>
                <td>
                    <code><?php echo esc_html( wmem_webhook_url() ); ?></code>
                    <p class="description"><?php esc_html_e( 'In Stripe, add this endpoint and send it checkout.session.completed and customer.subscription.deleted.', 'writer-members' ); ?></p>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="wmem-secret"><?php esc_html_e( 'Signing secret', 'writer-members' ); ?></label></th>
                <td>
                    <input id="wmem-secret" class="regular-text" type="password" autocomplete="off" name="wmem_settings[webhook_secret]" value="<?php echo esc_attr( $s['webhook_secret'] ); ?>" placeholder="whsec_…">
                    <p class="description"><?php esc_html_e( 'From the endpoint’s page in Stripe. Events without a valid signature are rejected.', 'writer-members' ); ?></p>
                </td>
            </tr>
        </table>
        <?php submit_button(); ?>
    </form>
    <?php
}

/* ------------------------------------------------------------------------
 * Tier on the user profile screen
 * --------------------------------------------------------------------- */

function wmem_profile_field( $user ) {
    if ( ! current_user_can( wmem_capability() ) ) {
        return;
    }
    ?>
    <h2><?php esc_html_e( 'Membership', 'writer-members' ); ?></h2>
    <table class="form-table" role="presentation">
        <tr>
            <th scope="row"><label for="wmem-tier"><?php esc_html_e( 'Tier', 'writer-members' ); ?></label></th>
            <td>
                <?php wp_nonce_field( 'wmem_profile_' . $user->ID, 'wmem_profile_nonce' ); ?>
                <?php echo wmem_tier_select( 'wmem_tier', wmem_user_tier( $user->ID ), true, 'wmem-tier' ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
            </td>
        </tr>
    </table>
    <?php
}
add_action( 'show_user_profile', 'wmem_profile_field' );
add_action( 'edit_user_profile', 'wmem_profile_field' );

function wmem_profile_save( $user_id ) {
    if ( ! current_user_can( wmem_capability() ) || ! isset( $_POST['wmem_profile_nonce'], $_POST['wmem_tier'] ) ) {
        return;
    }
    if ( ! wp_verify_nonce( sanitize_key( $_POST['wmem_profile_nonce'] ), 'wmem_profile_' . $user_id ) ) {
        return;
    }
    $slug = sanitize_key( wp_unslash( $_POST['wmem_tier'] ) );
    if ( '' === $slug || wmem_tier( $slug ) ) {
        wmem_set_user_tier( $user_id, $slug );
    }
}
add_action( 'personal_options_update', 'wmem_profile_save' );
add_action( 'edit_user_profile_update', 'wmem_profile_save' );
