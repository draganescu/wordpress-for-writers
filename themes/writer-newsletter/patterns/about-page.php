<?php
/**
 * Title: About the newsletter
 * Slug: writer-newsletter/about-page
 * Categories: about
 * Post Types: page
 * Description: An about page: who writes it, what it covers and how often it arrives.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size"><?php esc_html_e( 'A letter about writing, reading and paying attention, sent when there is something worth saying.', 'writer-newsletter' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'What you will get', 'writer-newsletter' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:list -->
<ul class="wp-block-list">
    <!-- wp:list-item -->
    <li><?php esc_html_e( 'One essay, roughly every two weeks.', 'writer-newsletter' ); ?></li>
    <!-- /wp:list-item -->
    <!-- wp:list-item -->
    <li><?php esc_html_e( 'A short list of things worth reading.', 'writer-newsletter' ); ?></li>
    <!-- /wp:list-item -->
    <!-- wp:list-item -->
    <li><?php esc_html_e( 'No tracking pixels and no ads.', 'writer-newsletter' ); ?></li>
    <!-- /wp:list-item -->
</ul>
<!-- /wp:list -->

<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'Who writes it', 'writer-newsletter' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p><?php esc_html_e( 'Tell readers who you are, what you care about and why you started writing this. A few honest sentences beat a long biography.', 'writer-newsletter' ); ?></p>
<!-- /wp:paragraph -->
