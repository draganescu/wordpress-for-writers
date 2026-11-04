<?php
/**
 * Title: Comments
 * Slug: writer-newsletter/comments
 * Categories: text
 * Inserter: no
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:comments {"className":"wnl-comments"} -->
<div class="wp-block-comments wnl-comments">
    <!-- wp:comments-title {"level":3} /-->
    <!-- wp:comment-template -->
        <!-- wp:group {"className":"wnl-comment","layout":{"type":"default"}} -->
        <div class="wp-block-group wnl-comment">
            <!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
            <div class="wp-block-group">
                <!-- wp:avatar {"size":32} /-->
                <!-- wp:comment-author-name /-->
                <!-- wp:comment-date {"format":"M j, Y"} /-->
            </div>
            <!-- /wp:group -->
            <!-- wp:comment-content /-->
            <!-- wp:comment-reply-link /-->
        </div>
        <!-- /wp:group -->
    <!-- /wp:comment-template -->
    <!-- wp:comments-pagination -->
        <!-- wp:comments-pagination-previous /-->
        <!-- wp:comments-pagination-numbers /-->
        <!-- wp:comments-pagination-next /-->
    <!-- /wp:comments-pagination -->
    <!-- wp:post-comments-form /-->
</div>
<!-- /wp:comments -->
