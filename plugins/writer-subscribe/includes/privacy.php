<?php
/**
 * Hook subscribers into WordPress's personal data export and erase tools.
 */

defined( 'ABSPATH' ) || exit;

add_filter( 'wp_privacy_personal_data_exporters', function ( $exporters ) {
    $exporters['writer-subscribe'] = array(
        'exporter_friendly_name' => __( 'Email subscription', 'writer-subscribe' ),
        'callback'               => function ( $email ) {
            $row  = wsub_get_by_email( strtolower( trim( $email ) ) );
            $data = array();
            if ( $row ) {
                $data[] = array(
                    'group_id'    => 'writer-subscribe',
                    'group_label' => __( 'Email subscription', 'writer-subscribe' ),
                    'item_id'     => 'wsub-' . $row->id,
                    'data'        => array(
                        array( 'name' => __( 'Email', 'writer-subscribe' ), 'value' => $row->email ),
                        array( 'name' => __( 'Status', 'writer-subscribe' ), 'value' => $row->status ),
                        array( 'name' => __( 'Signed up via', 'writer-subscribe' ), 'value' => wsub_source_label( $row->source ) ),
                        array( 'name' => __( 'Subscribed', 'writer-subscribe' ), 'value' => $row->created_at ),
                        array( 'name' => __( 'Confirmed', 'writer-subscribe' ), 'value' => (string) $row->confirmed_at ),
                        array( 'name' => __( 'Unsubscribed', 'writer-subscribe' ), 'value' => (string) $row->unsubscribed_at ),
                        array( 'name' => __( 'Consent given', 'writer-subscribe' ), 'value' => (string) $row->consented_at ),
                        array( 'name' => __( 'Consent text', 'writer-subscribe' ), 'value' => (string) $row->consent_text ),
                    ),
                );
            }
            return array( 'data' => $data, 'done' => true );
        },
    );
    return $exporters;
} );

add_filter( 'wp_privacy_personal_data_erasers', function ( $erasers ) {
    $erasers['writer-subscribe'] = array(
        'eraser_friendly_name' => __( 'Email subscription', 'writer-subscribe' ),
        'callback'             => function ( $email ) {
            $row     = wsub_get_by_email( strtolower( trim( $email ) ) );
            $removed = $row ? wsub_delete( $row->id ) : false;
            return array( 'items_removed' => $removed, 'items_retained' => false, 'messages' => array(), 'done' => true );
        },
    );
    return $erasers;
} );

/**
 * Suggested text for the site's privacy policy (Settings > Privacy).
 */
add_action( 'admin_init', function () {
    if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
        return;
    }
    $days = max( 1, (int) ceil( wsub_pending_retention() / DAY_IN_SECONDS ) );
    $content  = '<p class="privacy-policy-tutorial">' . esc_html__( 'Writer Subscribe stores the email addresses of people who sign up for new posts. Adjust this text if you send the list to an email service.', 'writer-subscribe' ) . '</p>';
    $content .= '<strong class="privacy-policy-tutorial">' . esc_html__( 'Suggested text:', 'writer-subscribe' ) . ' </strong>';
    $content .= '<p>' . esc_html__( 'When you subscribe to new posts by email, we store your email address, where on the site you signed up, and when you signed up, confirmed and unsubscribed. If the form asks you to agree to receive emails, we also store the wording you agreed to and when, as a record of your consent.', 'writer-subscribe' ) . '</p>';
    $content .= '<p>' . esc_html__( 'We use your address only to send you new posts. We may export the list to an email service to send them.', 'writer-subscribe' ) . '</p>';
    $content .= '<p>' . sprintf(
        /* translators: %d: number of days */
        esc_html__( 'If you don’t confirm your subscription, your address is deleted after %d days. Active subscriptions are kept until you unsubscribe. After you unsubscribe, we keep your address and the date so we don’t email you again or re-add you without your confirmation. You can ask us to delete it completely.', 'writer-subscribe' ),
        $days
    ) . '</p>';
    $content .= '<p>' . esc_html__( 'You can unsubscribe at any time with the unsubscribe link in our emails, or by contacting us. You can also ask us for a copy of the data we hold about you, or to erase it.', 'writer-subscribe' ) . '</p>';

    wp_add_privacy_policy_content( __( 'Writer Subscribe', 'writer-subscribe' ), wp_kses_post( $content ) );
} );
