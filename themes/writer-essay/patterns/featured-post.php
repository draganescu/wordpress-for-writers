<?php
/**
 * Title: Featured essay
 * Slug: writer-essay/featured-post
 * Categories: query, featured
 * Block Types: core/query
 * Description: The latest essay, large, with its image, excerpt and byline.
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":1,"query":{"perPage":1,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":false},"className":"wes-featured"} -->
<div class="wp-block-query wes-featured">
    <!-- wp:post-template -->
        <!-- wp:group {"className":"wes-featured-card","layout":{"type":"default"}} -->
        <div class="wp-block-group wes-featured-card">
            <!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9","className":"wes-featured-image"} /-->
            <!-- wp:group {"className":"wes-featured-text","layout":{"type":"default"}} -->
            <div class="wp-block-group wes-featured-text">
                <!-- wp:paragraph {"className":"wes-eyebrow"} -->
                <p class="wes-eyebrow"><?php esc_html_e( 'Latest essay', 'writer-essay' ); ?></p>
                <!-- /wp:paragraph -->
                <!-- wp:post-title {"level":2,"isLink":true,"className":"wes-featured-title"} /-->
                <!-- wp:post-excerpt {"excerptLength":30,"className":"wes-featured-excerpt"} /-->
                <!-- wp:pattern {"slug":"writer-essay/byline"} /-->
            </div>
            <!-- /wp:group -->
        </div>
        <!-- /wp:group -->
    <!-- /wp:post-template -->
</div>
<!-- /wp:query -->
