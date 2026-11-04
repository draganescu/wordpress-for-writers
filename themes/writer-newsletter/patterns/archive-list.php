<?php
/**
 * Title: Simple archive list
 * Slug: writer-newsletter/archive-list
 * Categories: query
 * Block Types: core/query
 * Description: A compact archive: one line per post with its date.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":2,"query":{"perPage":30,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true},"className":"wnl-archive-list"} -->
<div class="wp-block-query wnl-archive-list">
    <!-- wp:post-template -->
        <!-- wp:group {"className":"wnl-archive-row","layout":{"type":"flex","flexWrap":"nowrap","justifyContent":"space-between","verticalAlignment":"top"}} -->
        <div class="wp-block-group wnl-archive-row">
            <!-- wp:post-title {"isLink":true,"fontSize":"medium"} /-->
            <!-- wp:post-date {"format":"M j, Y"} /-->
        </div>
        <!-- /wp:group -->
    <!-- /wp:post-template -->

    <!-- wp:query-pagination {"paginationArrow":"arrow","layout":{"type":"flex","justifyContent":"space-between"}} -->
        <!-- wp:query-pagination-previous {"label":"<?php esc_attr_e( 'Newer', 'writer-newsletter' ); ?>"} /-->
        <!-- wp:query-pagination-next {"label":"<?php esc_attr_e( 'Older', 'writer-newsletter' ); ?>"} /-->
    <!-- /wp:query-pagination -->

    <!-- wp:query-no-results -->
        <!-- wp:paragraph -->
        <p><?php esc_html_e( 'No posts found.', 'writer-newsletter' ); ?></p>
        <!-- /wp:paragraph -->
    <!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
