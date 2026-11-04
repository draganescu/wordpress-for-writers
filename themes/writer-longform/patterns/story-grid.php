<?php
/**
 * Title: Story grid
 * Slug: writer-longform/story-grid
 * Categories: query
 * Block Types: core/query
 * Description: Stories in a responsive grid of cards.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":2,"query":{"perPage":9,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true},"align":"wide","className":"wlf-grid"} -->
<div class="wp-block-query alignwide wlf-grid">
    <!-- wp:post-template {"style":{"spacing":{"blockGap":"var:preset|spacing|50"}},"layout":{"type":"grid","columnCount":3,"minimumColumnWidth":"17rem"}} -->
        <!-- wp:pattern {"slug":"writer-longform/story-card"} /-->
    <!-- /wp:post-template -->

    <!-- wp:query-pagination {"paginationArrow":"arrow","layout":{"type":"flex","justifyContent":"space-between"}} -->
        <!-- wp:query-pagination-previous {"label":"<?php esc_attr_e( 'Newer stories', 'writer-longform' ); ?>"} /-->
        <!-- wp:query-pagination-next {"label":"<?php esc_attr_e( 'Older stories', 'writer-longform' ); ?>"} /-->
    <!-- /wp:query-pagination -->

    <!-- wp:query-no-results -->
        <!-- wp:paragraph -->
        <p><?php esc_html_e( 'No stories found.', 'writer-longform' ); ?></p>
        <!-- /wp:paragraph -->
    <!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
