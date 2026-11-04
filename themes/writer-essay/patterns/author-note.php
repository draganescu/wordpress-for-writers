<?php
/**
 * Title: Author's note
 * Slug: writer-essay/author-note
 * Categories: text
 * Description: A quiet italic note for the top or end of an essay, after a section break.
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:separator {"className":"is-style-dots"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-dots"/>
<!-- /wp:separator -->

<!-- wp:paragraph {"className":"wes-note"} -->
<p class="wes-note"><em><?php esc_html_e( 'This essay began as a talk. Thanks to everyone who asked a question afterwards; several of them are answered here.', 'writer-essay' ); ?></em></p>
<!-- /wp:paragraph -->
