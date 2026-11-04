<?php
/**
 * Title: Page not found
 * Slug: writer-newsletter/hidden-404
 * Inserter: no
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading"><?php esc_html_e( 'This page has gone missing', 'writer-newsletter' ); ?></h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><?php esc_html_e( 'The link may be old, or the post may have moved. Try a search, or pick something from the archive below.', 'writer-newsletter' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:search {"label":"<?php esc_attr_e( 'Search', 'writer-newsletter' ); ?>","showLabel":false,"placeholder":"<?php esc_attr_e( 'Search posts', 'writer-newsletter' ); ?>","buttonText":"<?php esc_attr_e( 'Search', 'writer-newsletter' ); ?>"} /-->
