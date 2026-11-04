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
                        array( 'name' => __( 'Subscribed', 'writer-subscribe' ), 'value' => $row->created_at ),
                        array( 'name' => __( 'Confirmed', 'writer-subscribe' ), 'value' => (string) $row->confirmed_at ),
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
