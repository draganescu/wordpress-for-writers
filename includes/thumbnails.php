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
    $featured = get_post_thumbnail_id( $post );
    if ( $featured && wp_attachment_is_image( $featured ) ) {
        return array(
            'url'    => wp_get_attachment_image_url( $featured, 'thumbnail' ),
            'source' => 'featured',
        );
    }

    if ( 'image' === get_post_format( $post ) ) {
        $image  = wfw_first_image( $post->post_content );
        $source = 'format';
    } else {
        $images = wfw_image_block_images( parse_blocks( $post->post_content ) );
        $image  = 1 === count( $images ) ? $images[0] : null;
        $source = 'block';
    }
    if ( ! $image ) {
        return null;
    }

    // Library images use the square crop WordPress makes for thumbnails; others keep the URL they have in the note.
    $url = $image['id'] && wp_attachment_is_image( $image['id'] )
        ? wp_get_attachment_image_url( $image['id'], 'thumbnail' )
        : esc_url_raw( $image['src'] );
    return $url ? array( 'url' => $url, 'source' => $source ) : null;
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
 * runs the callback for responses that include the field. Edit context only:
 * there the API returns just the notes the user can edit, so an image from a
 * note's content never reaches anyone who can't read that content.
 */
add_action( 'rest_api_init', function () {
    register_rest_field( 'post', 'wfw_thumbnail', array(
        'get_callback' => function ( $data ) {
            $post = get_post( $data['id'] );
            return $post ? wfw_note_thumbnail( $post ) : null;
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
