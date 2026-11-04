<?php
/**
 * Title: Essay list
 * Slug: writer-essay/post-list
 * Categories: query
 * Block Types: core/query
 * Description: Essays with author, title, excerpt, reading time and a thumbnail.
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":2,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true},"className":"wes-post-list"} -->
<div class="wp-block-query wes-post-list">
    <!-- wp:post-template -->
        <!-- wp:pattern {"slug":"writer-essay/post-row"} /-->
    <!-- /wp:post-template -->

    <!-- wp:query-pagination {"paginationArrow":"arrow","layout":{"type":"flex","justifyContent":"space-between"}} -->
        <!-- wp:query-pagination-previous {"label":"<?php esc_attr_e( 'Newer', 'writer-essay' ); ?>"} /-->
        <!-- wp:query-pagination-next {"label":"<?php esc_attr_e( 'Older', 'writer-essay' ); ?>"} /-->
    <!-- /wp:query-pagination -->

    <!-- wp:query-no-results -->
        <!-- wp:paragraph -->
        <p><?php esc_html_e( 'Nothing here yet.', 'writer-essay' ); ?></p>
        <!-- /wp:paragraph -->
    <!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
