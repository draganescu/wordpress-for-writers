<?php
/**
 * Title: Page not found
 * Slug: writer-longform/hidden-404
 * Inserter: no
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading"><?php esc_html_e( 'This page has gone missing', 'writer-longform' ); ?></h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><?php esc_html_e( 'The link may be old, or the post may have moved. Try a search, or pick something from the archive below.', 'writer-longform' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:search {"label":"<?php esc_attr_e( 'Search', 'writer-longform' ); ?>","showLabel":false,"placeholder":"<?php esc_attr_e( 'Search posts', 'writer-longform' ); ?>","buttonText":"<?php esc_attr_e( 'Search', 'writer-longform' ); ?>"} /-->
