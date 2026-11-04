<?php
/**
 * Title: Colophon
 * Slug: writer-longform/colophon
 * Categories: footer
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wlf-colophon","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between"}} -->
<div class="wp-block-group wlf-colophon">
    <!-- wp:site-title {"level":0} /-->
    <!-- wp:paragraph -->
    <p>
    <?php
    printf(
        /* translators: %s: WordPress link. */
        esc_html__( 'Published with %s', 'writer-longform' ),
        '<a href="' . esc_url( __( 'https://wordpress.org', 'writer-longform' ) ) . '">WordPress</a>'
    );
    ?>
    </p>
    <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
