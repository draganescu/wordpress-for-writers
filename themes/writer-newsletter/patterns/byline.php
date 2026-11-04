<?php
/**
 * Title: Byline
 * Slug: writer-newsletter/byline
 * Categories: text
 * Inserter: no
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wnl-byline","layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group wnl-byline">
    <!-- wp:avatar {"size":44,"isLink":true} /-->
    <!-- wp:group {"className":"wnl-byline-text","layout":{"type":"flex","orientation":"vertical"}} -->
    <div class="wp-block-group wnl-byline-text">
        <!-- wp:post-author-name {"isLink":true} /-->
        <!-- wp:group {"className":"wnl-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
        <div class="wp-block-group wnl-meta">
            <!-- wp:post-date {"format":"F j, Y"} /-->
            <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-newsletter/reading-time"}}},"className":"wnl-reading-time"} -->
            <p class="wnl-reading-time"></p>
            <!-- /wp:paragraph -->
        </div>
        <!-- /wp:group -->
    </div>
    <!-- /wp:group -->
</div>
<!-- /wp:group -->
