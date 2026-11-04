<?php
/**
 * Title: Dated post list
 * Slug: writer-newsletter/post-list
 * Categories: query
 * Block Types: core/query
 * Description: Posts newest first, each with its date, title, excerpt and reading time.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:query {"queryId":1,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true},"className":"wnl-post-list"} -->
<div class="wp-block-query wnl-post-list">
    <!-- wp:post-template -->
        <!-- wp:group {"className":"wnl-post-row","layout":{"type":"default"}} -->
        <div class="wp-block-group wnl-post-row">
            <!-- wp:post-date {"format":"F j, Y","className":"wnl-kicker"} /-->
            <!-- wp:post-title {"isLink":true,"fontSize":"large"} /-->
            <!-- wp:post-excerpt {"excerptLength":26} /-->
            <!-- wp:group {"className":"wnl-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
            <div class="wp-block-group wnl-meta">
                <!-- wp:post-author-name /-->
                <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-newsletter/reading-time"}}},"className":"wnl-reading-time"} -->
                <p class="wnl-reading-time"></p>
                <!-- /wp:paragraph -->
            </div>
            <!-- /wp:group -->
        </div>
        <!-- /wp:group -->
    <!-- /wp:post-template -->

    <!-- wp:query-pagination {"paginationArrow":"arrow","layout":{"type":"flex","justifyContent":"space-between"}} -->
        <!-- wp:query-pagination-previous {"label":"<?php esc_attr_e( 'Newer', 'writer-newsletter' ); ?>"} /-->
        <!-- wp:query-pagination-next {"label":"<?php esc_attr_e( 'Older', 'writer-newsletter' ); ?>"} /-->
    <!-- /wp:query-pagination -->

    <!-- wp:query-no-results -->
        <!-- wp:paragraph -->
        <p><?php esc_html_e( 'Nothing here yet.', 'writer-newsletter' ); ?></p>
        <!-- /wp:paragraph -->
    <!-- /wp:query-no-results -->
</div>
<!-- /wp:query -->
