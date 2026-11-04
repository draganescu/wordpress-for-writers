<?php
/**
 * Title: Lead story
 * Slug: writer-longform/lead-story
 * Categories: query, featured
 * Block Types: core/query
 * Description: The latest story as a full-width cover with its title over the image.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":1,"query":{"perPage":1,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false},"align":"full","className":"wlf-lead"} -->
<div class="wp-block-query alignfull wlf-lead">
    <!-- wp:post-template -->
        <!-- wp:cover {"useFeaturedImage":true,"dimRatio":50,"customOverlayColor":"#141414","isUserOverlayColor":true,"minHeight":72,"minHeightUnit":"vh","contentPosition":"bottom center","isDark":true,"align":"full","className":"wlf-hero wlf-hero--lead","layout":{"type":"constrained","contentSize":"1200px"}} -->
        <div class="wp-block-cover alignfull has-custom-content-position is-position-bottom-center wlf-hero wlf-hero--lead" style="min-height:72vh"><span aria-hidden="true" class="wp-block-cover__background has-background-dim" style="background-color:#141414"></span><div class="wp-block-cover__inner-container">
            <!-- wp:group {"className":"wlf-hero-text","layout":{"type":"default"}} -->
            <div class="wp-block-group wlf-hero-text">
                <!-- wp:paragraph {"className":"wlf-kicker"} -->
                <p class="wlf-kicker"><?php esc_html_e( 'The latest story', 'writer-longform' ); ?></p>
                <!-- /wp:paragraph -->
                <!-- wp:post-title {"level":2,"isLink":true,"className":"wlf-hero-title"} /-->
                <!-- wp:post-excerpt {"excerptLength":28,"className":"wlf-hero-dek"} /-->
                <!-- wp:pattern {"slug":"writer-longform/byline"} /-->
            </div>
            <!-- /wp:group -->
        </div></div>
        <!-- /wp:cover -->
    <!-- /wp:post-template -->
</div>
<!-- /wp:query -->
