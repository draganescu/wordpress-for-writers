<?php
/**
 * Title: Story hero, title over the image
 * Slug: writer-longform/hero-overlay
 * Categories: featured
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:cover {"useFeaturedImage":true,"dimRatio":50,"customOverlayColor":"#141414","isUserOverlayColor":true,"minHeight":86,"minHeightUnit":"vh","contentPosition":"bottom center","isDark":true,"align":"full","className":"wlf-hero","layout":{"type":"constrained","contentSize":"900px"}} -->
<div class="wp-block-cover alignfull has-custom-content-position is-position-bottom-center wlf-hero" style="min-height:86vh"><span aria-hidden="true" class="wp-block-cover__background has-background-dim" style="background-color:#141414"></span><div class="wp-block-cover__inner-container">
    <!-- wp:group {"className":"wlf-hero-text","layout":{"type":"default"}} -->
    <div class="wp-block-group wlf-hero-text">
        <!-- wp:post-terms {"term":"category","className":"wlf-kicker"} /-->
        <!-- wp:post-title {"level":1,"className":"wlf-hero-title"} /-->
        <!-- wp:pattern {"slug":"writer-longform/byline"} /-->
    </div>
    <!-- /wp:group -->
</div></div>
<!-- /wp:cover -->
