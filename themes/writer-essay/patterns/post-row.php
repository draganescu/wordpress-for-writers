<?php
/**
 * Title: Essay list row
 * Slug: writer-essay/post-row
 * Inserter: no
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wes-post-row","layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"top","justifyContent":"space-between"}} -->
<div class="wp-block-group wes-post-row">
    <!-- wp:group {"className":"wes-post-row-text","layout":{"type":"default"}} -->
    <div class="wp-block-group wes-post-row-text">
        <!-- wp:post-terms {"term":"category","className":"wes-eyebrow"} /-->
        <!-- wp:post-title {"isLink":true,"fontSize":"large"} /-->
        <!-- wp:post-excerpt {"excerptLength":26} /-->
        <!-- wp:group {"className":"wes-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
        <div class="wp-block-group wes-meta">
            <!-- wp:post-date {"format":"M j, Y"} /-->
            <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-essay/reading-time"}}},"className":"wes-reading-time"} -->
            <p class="wes-reading-time"></p>
            <!-- /wp:paragraph -->
        </div>
        <!-- /wp:group -->
    </div>
    <!-- /wp:group -->
    <!-- wp:post-featured-image {"isLink":true,"aspectRatio":"1","width":"128px","className":"wes-thumb"} /-->
</div>
<!-- /wp:group -->
