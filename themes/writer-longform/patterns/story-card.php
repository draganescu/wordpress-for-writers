<?php
/**
 * Title: Story card
 * Slug: writer-longform/story-card
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wlf-card","layout":{"type":"default"}} -->
<div class="wp-block-group wlf-card">
    <!-- wp:post-featured-image {"isLink":true,"aspectRatio":"3/2","className":"wlf-card-image"} /-->
    <!-- wp:post-terms {"term":"category","className":"wlf-kicker"} /-->
    <!-- wp:post-title {"isLink":true,"level":3,"className":"wlf-card-title"} /-->
    <!-- wp:post-excerpt {"excerptLength":22} /-->
    <!-- wp:group {"className":"wlf-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
    <div class="wp-block-group wlf-meta">
        <!-- wp:post-author-name /-->
        <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-longform/reading-time"}}},"className":"wlf-reading-time"} -->
        <p class="wlf-reading-time"></p>
        <!-- /wp:paragraph -->
    </div>
    <!-- /wp:group -->
</div>
<!-- /wp:group -->
