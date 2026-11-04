<?php
/**
 * Title: Byline
 * Slug: writer-essay/byline
 * Categories: text
 * Inserter: no
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wes-byline","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group wes-byline">
    <!-- wp:avatar {"size":44,"isLink":true} /-->
    <!-- wp:group {"className":"wes-byline-text","layout":{"type":"flex","orientation":"vertical"}} -->
    <div class="wp-block-group wes-byline-text">
        <!-- wp:post-author-name {"isLink":true} /-->
        <!-- wp:group {"className":"wes-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
        <div class="wp-block-group wes-meta">
            <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-essay/reading-time"}}},"className":"wes-reading-time"} -->
            <p class="wes-reading-time"></p>
            <!-- /wp:paragraph -->
            <!-- wp:post-date {"format":"M j, Y"} /-->
        </div>
        <!-- /wp:group -->
    </div>
    <!-- /wp:group -->
</div>
<!-- /wp:group -->
