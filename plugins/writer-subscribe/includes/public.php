<?php
/**
 * Front end: signup endpoint, confirm/unsubscribe pages, forms, popup.
 */

defined( 'ABSPATH' ) || exit;

/* ------------------------------------------------------------------------
 * Signup
 * --------------------------------------------------------------------- */

/**
 * Too many attempts from this address recently?
 */
function wsub_rate_limited() {
    $ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
    $key = 'wsub_rl_' . md5( $ip . wp_salt( 'nonce' ) );
    $n   = (int) get_transient( $key );
    if ( $n >= (int) apply_filters( 'wsub_rate_limit', 10 ) ) {
        return true;
    }
    set_transient( $key, $n + 1, HOUR_IN_SECONDS );
    return false;
}

/**
 * Process a signup from any entry point.
 *
 * @return array{ ok: bool, code: string, message: string }
 */
function wsub_handle_signup( $email, $source, $honeypot, $consented ) {
    $double = (bool) wsub_setting( 'double_opt_in' );
    $check  = $double
        ? __( 'Almost done. Check your inbox to confirm.', 'writer-subscribe' )
        : __( 'You’re subscribed. Thank you!', 'writer-subscribe' );

    // Bots fill the hidden field; tell them it worked and do nothing.
    if ( '' !== trim( (string) $honeypot ) ) {
        return array( 'ok' => true, 'code' => 'ok', 'message' => $check );
    }

    if ( wsub_rate_limited() ) {
        return array( 'ok' => false, 'code' => 'rate_limited', 'message' => __( 'Too many attempts. Please try again later.', 'writer-subscribe' ) );
    }

    if ( ! is_email( trim( (string) $email ) ) ) {
        return array( 'ok' => false, 'code' => 'invalid_email', 'message' => __( 'Please enter a valid email address.', 'writer-subscribe' ) );
    }

    if ( '' !== wsub_setting( 'consent' ) && ! $consented ) {
        return array( 'ok' => false, 'code' => 'consent_required', 'message' => __( 'Please tick the box to agree.', 'writer-subscribe' ) );
    }

    $result = wsub_add( $email, sanitize_text_field( (string) $source ), $double );

    if ( 'error' === $result['status'] ) {
        return array( 'ok' => false, 'code' => 'error', 'message' => __( 'Something went wrong. Please try again.', 'writer-subscribe' ) );
    }

    if ( 'pending' === $result['status'] ) {
        wsub_send_confirmation( $result['row'] );
    }

    // 'already' gets the same answer as a fresh signup, so the form can't be
    // used to find out who is on the list.
    return array( 'ok' => true, 'code' => 'ok', 'message' => $check );
}

function wsub_send_confirmation( $row ) {
    $site    = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
    $subject = sprintf( __( 'Confirm your subscription to %s', 'writer-subscribe' ), $site );
    $body    = sprintf(
        /* translators: 1: site name, 2: confirm URL */
        __( "Hi,\n\nPlease confirm you want new posts from %1\$s by email:\n\n%2\$s\n\nIf you didn't ask for this, ignore this email and you won't hear from us.\n", 'writer-subscribe' ),
        $site,
        wsub_confirm_url( $row )
    );

    $subject = apply_filters( 'wsub_confirmation_subject', $subject, $row );
    $body    = apply_filters( 'wsub_confirmation_body', $body, $row );

    return wp_mail( $row->email, $subject, $body );
}

add_action( 'rest_api_init', function () {
    register_rest_route(
        'writer-subscribe/v1',
        '/subscribe',
        array(
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'args'                => array(
                'email'   => array( 'type' => 'string', 'required' => true ),
                'source'  => array( 'type' => 'string', 'default' => '' ),
                'website' => array( 'type' => 'string', 'default' => '' ),
                'consent' => array( 'type' => 'boolean', 'default' => false ),
            ),
            'callback'            => function ( WP_REST_Request $req ) {
                $r = wsub_handle_signup( $req['email'], $req['source'], $req['website'], $req['consent'] );
                $status = $r['ok'] ? 200 : ( 'rate_limited' === $r['code'] ? 429 : 400 );
                return new WP_REST_Response( $r, $status );
            },
        )
    );
} );

/**
 * No-JS fallback: the form posts here, we redirect back with a notice.
 */
function wsub_admin_post_signup() {
    // phpcs:disable WordPress.Security.NonceVerification -- public form, works with page caching.
    $r = wsub_handle_signup(
        isset( $_POST['email'] ) ? sanitize_text_field( wp_unslash( $_POST['email'] ) ) : '',
        isset( $_POST['source'] ) ? sanitize_text_field( wp_unslash( $_POST['source'] ) ) : '',
        isset( $_POST['website'] ) ? sanitize_text_field( wp_unslash( $_POST['website'] ) ) : '',
        ! empty( $_POST['consent'] )
    );
    // phpcs:enable

    $back = wp_get_referer() ? wp_get_referer() : home_url( '/' );
    wp_safe_redirect( add_query_arg( 'wsub_notice', $r['ok'] ? 'signup' : $r['code'], $back ) );
    exit;
}
add_action( 'admin_post_nopriv_wsub_subscribe', 'wsub_admin_post_signup' );
add_action( 'admin_post_wsub_subscribe', 'wsub_admin_post_signup' );

/* ------------------------------------------------------------------------
 * Confirm and unsubscribe links
 *
 * A GET only shows a button; the change happens on POST. Mail scanners
 * that open every link would otherwise confirm or unsubscribe people.
 * --------------------------------------------------------------------- */

add_action( 'template_redirect', function () {
    // phpcs:disable WordPress.Security.NonceVerification -- the token is the credential.
    $actions = array( 'wsub_confirm', 'wsub_unsubscribe' );
    foreach ( $actions as $action ) {
        if ( ! isset( $_REQUEST[ $action ] ) ) {
            continue;
        }
        $token = preg_replace( '/[^A-Za-z0-9]/', '', (string) wp_unslash( $_REQUEST[ $action ] ) );
        $row   = wsub_get_by_token( $token );
        $post  = 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' );

        nocache_headers();

        if ( ! $row ) {
            wsub_message_page( __( 'This link has expired or was already used.', 'writer-subscribe' ) );
        }

        if ( $post ) {
            if ( 'wsub_confirm' === $action ) {
                wsub_confirm( $row );
                wp_safe_redirect( add_query_arg( 'wsub_notice', 'confirmed', home_url( '/' ) ) );
            } else {
                wsub_unsubscribe( $row );
                wp_safe_redirect( add_query_arg( 'wsub_notice', 'unsubscribed', home_url( '/' ) ) );
            }
            exit;
        }

        if ( 'wsub_confirm' === $action ) {
            wsub_message_page(
                sprintf( __( 'Confirm %s?', 'writer-subscribe' ), '<strong>' . esc_html( $row->email ) . '</strong>' ),
                $action,
                $token,
                __( 'Yes, subscribe me', 'writer-subscribe' )
            );
        }
        wsub_message_page(
            sprintf( __( 'Unsubscribe %s?', 'writer-subscribe' ), '<strong>' . esc_html( $row->email ) . '</strong>' ),
            $action,
            $token,
            __( 'Unsubscribe', 'writer-subscribe' )
        );
    }
    // phpcs:enable
} );

/**
 * A small standalone page with an optional one-button form. Exits.
 */
function wsub_message_page( $html, $action = '', $token = '', $button = '' ) {
    $form = '';
    if ( $action ) {
        $form = sprintf(
            '<form method="post" action="%s"><input type="hidden" name="%s" value="%s"><p><button class="button button-primary button-large" type="submit">%s</button></p></form>',
            esc_url( home_url( '/' ) ),
            esc_attr( $action ),
            esc_attr( $token ),
            esc_html( $button )
        );
    }
    wp_die(
        '<p>' . wp_kses( $html, array( 'strong' => array() ) ) . '</p>' . $form, // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts.
        esc_html( get_bloginfo( 'name' ) ),
        array( 'response' => 200, 'back_link' => false, 'link_url' => home_url( '/' ), 'link_text' => __( 'Go to the site', 'writer-subscribe' ) )
    );
}

/* ------------------------------------------------------------------------
 * Forms
 * --------------------------------------------------------------------- */

/**
 * Markup for a signup form. Works without JavaScript; app.js upgrades it.
 */
function wsub_form( $args = array() ) {
    $s    = wsub_settings();
    $args = wp_parse_args(
        $args,
        array( 'heading' => $s['heading'], 'text' => $s['text'], 'button' => $s['button'], 'source' => 'inline', 'class' => '' )
    );
    $id = wp_unique_id( 'wsub-' );

    ob_start();
    ?>
    <form class="wsub-form <?php echo esc_attr( $args['class'] ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-source="<?php echo esc_attr( $args['source'] ); ?>">
        <?php if ( '' !== $args['heading'] ) : ?>
            <p class="wsub-heading"><?php echo esc_html( $args['heading'] ); ?></p>
        <?php endif; ?>
        <?php if ( '' !== $args['text'] ) : ?>
            <p class="wsub-text"><?php echo esc_html( $args['text'] ); ?></p>
        <?php endif; ?>
        <input type="hidden" name="action" value="wsub_subscribe">
        <input type="hidden" name="source" value="<?php echo esc_attr( $args['source'] ); ?>">
        <div class="wsub-hp" aria-hidden="true">
            <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>
        </div>
        <div class="wsub-row">
            <label class="wsub-sr" for="<?php echo esc_attr( $id ); ?>"><?php esc_html_e( 'Email address', 'writer-subscribe' ); ?></label>
            <input class="wsub-email" id="<?php echo esc_attr( $id ); ?>" type="email" name="email" required autocomplete="email" inputmode="email" placeholder="<?php esc_attr_e( 'you@example.com', 'writer-subscribe' ); ?>">
            <button class="wsub-button" type="submit"><?php echo esc_html( $args['button'] ); ?></button>
        </div>
        <?php if ( '' !== $s['consent'] ) : ?>
            <label class="wsub-consent"><input type="checkbox" name="consent" value="1" required> <?php echo esc_html( $s['consent'] ); ?></label>
        <?php endif; ?>
        <p class="wsub-msg" role="status" aria-live="polite"></p>
    </form>
    <?php
    return ob_get_clean();
}

add_shortcode( 'writer_subscribe', function ( $atts ) {
    $atts = shortcode_atts( array( 'heading' => null, 'text' => null, 'button' => null ), $atts, 'writer_subscribe' );
    return wsub_form( array_filter( $atts, 'is_string' ) );
} );

add_action( 'init', function () {
    wp_register_script(
        'wsub-block',
        WSUB_URL . 'assets/block.js',
        array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ),
        wsub_asset_version( 'assets/block.js' ),
        true
    );
    wp_register_style( 'wsub', WSUB_URL . 'assets/subscribe.css', array(), wsub_asset_version( 'assets/subscribe.css' ) );

    register_block_type(
        'writer-subscribe/form',
        array(
            'api_version'     => 3,
            'title'           => __( 'Subscribe form', 'writer-subscribe' ),
            'category'        => 'widgets',
            'icon'            => 'email',
            'editor_script'   => 'wsub-block',
            'style'           => 'wsub',
            'attributes'      => array(
                'heading' => array( 'type' => 'string' ),
                'text'    => array( 'type' => 'string' ),
                'button'  => array( 'type' => 'string' ),
            ),
            'supports'        => array( 'align' => array( 'wide', 'full' ), 'html' => false ),
            'render_callback' => function ( $attrs ) {
                $args = array_filter(
                    array(
                        'heading' => $attrs['heading'] ?? null,
                        'text'    => $attrs['text'] ?? null,
                        'button'  => $attrs['button'] ?? null,
                    ),
                    'is_string'
                );
                $args['source'] = 'block';
                return '<div ' . get_block_wrapper_attributes() . '>' . wsub_form( $args ) . '</div>';
            },
        )
    );
} );

/* ------------------------------------------------------------------------
 * Front-end assets and popup
 * --------------------------------------------------------------------- */

/**
 * Show the popup on this request?
 */
function wsub_popup_enabled() {
    $show = wsub_setting( 'popup' ) && is_singular( 'post' ) && ! current_user_can( 'edit_posts' );
    return (bool) apply_filters( 'wsub_show_popup', $show );
}

add_action( 'wp_enqueue_scripts', function () {
    wp_enqueue_style( 'wsub' );
    wp_enqueue_script( 'wsub', WSUB_URL . 'assets/subscribe.js', array(), wsub_asset_version( 'assets/subscribe.js' ), array( 'strategy' => 'defer', 'in_footer' => true ) );

    $notices = array(
        'signup'           => wsub_setting( 'double_opt_in' ) ? __( 'Almost done. Check your inbox to confirm.', 'writer-subscribe' ) : __( 'You’re subscribed. Thank you!', 'writer-subscribe' ),
        'confirmed'        => __( 'You’re subscribed. Thank you!', 'writer-subscribe' ),
        'unsubscribed'     => __( 'You’ve been unsubscribed.', 'writer-subscribe' ),
        'invalid_email'    => __( 'Please enter a valid email address.', 'writer-subscribe' ),
        'consent_required' => __( 'Please tick the box to agree.', 'writer-subscribe' ),
        'rate_limited'     => __( 'Too many attempts. Please try again later.', 'writer-subscribe' ),
        'error'            => __( 'Something went wrong. Please try again.', 'writer-subscribe' ),
    );

    $config = array(
        'endpoint'   => esc_url_raw( rest_url( 'writer-subscribe/v1/subscribe' ) ),
        'popup'      => wsub_popup_enabled() ? wsub_form( array( 'source' => 'popup:' . get_the_ID(), 'class' => 'wsub-form--popup' ) ) : '',
        'scroll'     => (int) wsub_setting( 'scroll' ),
        'snoozeDays' => (int) wsub_setting( 'snooze_days' ),
        'notices'    => $notices,
        'label'      => __( 'Subscribe by email', 'writer-subscribe' ),
        'close'      => __( 'Close', 'writer-subscribe' ),
        'failed'     => $notices['error'],
    );

    wp_add_inline_script( 'wsub', 'window.wsubConfig = ' . wp_json_encode( $config ) . ';', 'before' );
} );
