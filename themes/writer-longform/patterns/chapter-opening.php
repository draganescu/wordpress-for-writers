<?php
/**
 * Title: Chapter opening
 * Slug: writer-longform/chapter-opening
 * Categories: text
 * Description: A numbered chapter heading followed by an opening paragraph with a drop cap.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:heading -->
<h2 class="wp-block-heading"><?php esc_html_e( 'The river at seven', 'writer-longform' ); ?></h2>
<!-- /wp:heading -->

<!-- wp:paragraph {"dropCap":true} -->
<p class="has-drop-cap"><?php esc_html_e( 'Start the chapter here. The heading above is numbered automatically in stories; pick the Plain heading style to leave a heading unnumbered.', 'writer-longform' ); ?></p>
<!-- /wp:paragraph -->
