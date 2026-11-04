<?php
/**
 * Title: Colophon
 * Slug: writer-newsletter/colophon
 * Categories: footer
 * Inserter: no
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wnl-colophon","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between"}} -->
<div class="wp-block-group wnl-colophon">
    <!-- wp:site-title {"level":0} /-->
    <!-- wp:paragraph -->
    <p>
    <?php
    printf(
        /* translators: %s: WordPress link. */
        esc_html__( 'Published with %s', 'writer-newsletter' ),
        '<a href="' . esc_url( __( 'https://wordpress.org', 'writer-newsletter' ) ) . '">WordPress</a>'
    );
    ?>
    </p>
    <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
