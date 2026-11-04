<?php
/**
 * Title: Byline
 * Slug: writer-longform/byline
 * Categories: text
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:group {"className":"wlf-meta wlf-byline","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group wlf-meta wlf-byline">
    <!-- wp:post-author-name {"isLink":true} /-->
    <!-- wp:post-date {"format":"F j, Y"} /-->
    <!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"writer-longform/reading-time"}}},"className":"wlf-reading-time"} -->
    <p class="wlf-reading-time"></p>
    <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->
