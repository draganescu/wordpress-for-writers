<?php
/**
 * Title: Story end: tags and author
 * Slug: writer-longform/author-box
 * Categories: text
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wlf-story-end","layout":{"type":"default"}} -->
<div class="wp-block-group wlf-story-end">
    <!-- wp:post-terms {"term":"post_tag","className":"wlf-tags"} /-->
    <!-- wp:group {"className":"wlf-author","layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"top"}} -->
    <div class="wp-block-group wlf-author">
        <!-- wp:avatar {"size":56,"isLink":true} /-->
        <!-- wp:group {"layout":{"type":"default"}} -->
        <div class="wp-block-group">
            <!-- wp:post-author-name {"isLink":true,"className":"wlf-author-name"} /-->
            <!-- wp:post-author-biography /-->
        </div>
        <!-- /wp:group -->
    </div>
    <!-- /wp:group -->
</div>
<!-- /wp:group -->
