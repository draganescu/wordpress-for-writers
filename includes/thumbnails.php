<?php
/**
 * The image beside each note in the note list.
 *
 * A note shows its featured image. Without one, a note in the Image post
 * format shows the first image in its content, and any other note with
 * exactly one Image block shows that block's image, wherever the block sits
 * (in a Group, Columns, a Gallery…) and whatever text is around it.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The note list's thumbnail for a post: its URL and where it comes from
 * ('featured', 'format' or 'block'), or null when the note has none.
 */
function wfw_note_thumbnail( $post ) {
    $thumbnail = null;

    // Whoever edits the note picks the attachment IDs, both the featured one
    // and the wp-image-{id} class in its content, so an ID only turns into a
    // URL when the user may read that attachment, the way core's media
    // endpoint decides it. Any other ID counts as no library image.
    $featured = get_post_thumbnail_id( $post );
    if ( $featured && wfw_can_read_attachment( $featured ) && wp_attachment_is_image( $featured ) ) {
        $thumbnail = array(
            'url'    => wp_get_attachment_image_url( $featured, 'thumbnail' ),
            'source' => 'featured',
        );
    } else {
        if ( 'image' === get_post_format( $post ) ) {
            $image  = wfw_first_image( $post->post_content );
            $source = 'format';
        } else {
            $images = wfw_image_block_images( parse_blocks( $post->post_content ) );
            $image  = 1 === count( $images ) ? $images[0] : null;
            $source = 'block';
        }
        if ( $image ) {
            // Library images use the square crop WordPress makes for thumbnails; others keep the URL they have in the note.
            $url = $image['id'] && wfw_can_read_attachment( $image['id'] ) && wp_attachment_is_image( $image['id'] )
                ? wp_get_attachment_image_url( $image['id'], 'thumbnail' )
                : esc_url_raw( $image['src'] );
            $thumbnail = $url ? array( 'url' => $url, 'source' => $source ) : null;
        }
    }

    /**
     * The thumbnail the note list shows for a post, or null for none. A plugin
     * that keeps part of a note from some readers, such as a paywall, returns
     * null here for those readers, so no image from the hidden part reaches
     * them through the list.
     *
     * @param array|null $thumbnail The thumbnail's 'url' and 'source' ('featured', 'format' or 'block'), or null.
     * @param WP_Post    $post      The note.
     */
    return apply_filters( 'wfw_note_thumbnail', $thumbnail, $post );
}

/**
 * Whether the current user may read an attachment, as core's media endpoint
 * decides it. The read_post capability alone is stricter than that: for an
 * attachment that inherits its status from an unpublished parent it wants the
 * user to be the attachment's own author, so an image an editor dropped into
 * an author's draft would fail it even though the author can read the draft
 * and /wp/v2/media hands them the image. Like core, an inherited attachment
 * is readable when its parent is.
 */
function wfw_can_read_attachment( $attachment_id ) {
    if ( current_user_can( 'read_post', $attachment_id ) ) {
        return true;
    }
    $attachment = get_post( $attachment_id );
    return $attachment
        && 'inherit' === $attachment->post_status
        && $attachment->post_parent > 0
        && current_user_can( 'read_post', $attachment->post_parent );
}

/**
 * The first image with a source in some HTML: its src, and its attachment ID
 * from the wp-image-{id} class WordPress gives library images (0 for others).
 */
function wfw_first_image( $html ) {
    $tags = new WP_HTML_Tag_Processor( $html );
    while ( $tags->next_tag( 'img' ) ) {
        $src = $tags->get_attribute( 'src' );
        if ( is_string( $src ) && '' !== trim( $src ) ) {
            preg_match( '/\bwp-image-(\d+)\b/', (string) $tags->get_attribute( 'class' ), $match );
            return array(
                'id'  => (int) ( $match[1] ?? 0 ),
                'src' => trim( $src ),
            );
        }
    }
    return null;
}

/**
 * The images of the Image blocks in a parsed block tree, nested blocks
 * included. Image blocks still waiting for an image are left out.
 */
function wfw_image_block_images( $blocks ) {
    $images = array();
    foreach ( $blocks as $block ) {
        $image = 'core/image' === $block['blockName'] ? wfw_first_image( $block['innerHTML'] ) : null;
        if ( $image ) {
            $images[] = $image;
        }
        $images = array_merge( $images, wfw_image_block_images( $block['innerBlocks'] ) );
    }
    return $images;
}

/**
 * The list asks for this field only while it shows images, and WordPress only
 * runs the callback for responses that include the field. Edit context only,
 * though that alone keeps nothing private: before WordPress 6.9 the edit
 * context lists other people's published notes too, and a companion plugin
 * may hide part of a note from some readers. So the field is null unless the
 * user can edit the note, and plugins have the last word through the
 * wfw_note_thumbnail filter.
 */
add_action( 'rest_api_init', function () {
    register_rest_field( 'post', 'wfw_thumbnail', array(
        'get_callback' => function ( $data ) {
            $post = get_post( $data['id'] );
            if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
                return null;
            }
            return wfw_note_thumbnail( $post );
        },
        'schema'       => array(
            'description' => __( 'The image the note list shows for the post: its featured image, else one from its content.', 'wordpress-for-writers' ),
            'type'        => array( 'object', 'null' ),
            'context'     => array( 'edit' ),
            'readonly'    => true,
            'properties'  => array(
                'url'    => array( 'type' => 'string' ),
                'source' => array(
                    'type' => 'string',
                    'enum' => array( 'featured', 'format', 'block' ),
                ),
            ),
        ),
    ) );
} );
