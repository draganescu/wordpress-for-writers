<?php
/**
 * Title: Colophon
 * Slug: writer-essay/colophon
 * Categories: footer
 * Inserter: no
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wes-colophon","layout":{"type":"flex","flexWrap":"wrap","justifyContent":"space-between"}} -->
<div class="wp-block-group wes-colophon">
    <!-- wp:site-title {"level":0} /-->
    <!-- wp:paragraph -->
    <p>
    <?php
    printf(
        /* translators: %s: WordPress link. */
        esc_html__( 'Published with %s', 'writer-essay' ),
        '<a href="' . esc_url( __( 'https://wordpress.org', 'writer-essay' ) ) . '">WordPress</a>'
    );
    ?>
    </p>
    <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
