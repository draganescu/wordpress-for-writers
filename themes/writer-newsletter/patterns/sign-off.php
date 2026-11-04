<?php
/**
 * Title: Issue sign-off
 * Slug: writer-newsletter/sign-off
 * Categories: text
 * Description: A short closing note for the end of an issue.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:separator {"className":"is-style-dots"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-dots"/>
<!-- /wp:separator -->

<!-- wp:paragraph {"className":"wnl-sign-off"} -->
<p class="wnl-sign-off"><?php esc_html_e( 'Thanks for reading. If this landed in your inbox from a friend, you can reply to say hello, or forward it to someone who might like it.', 'writer-newsletter' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:paragraph {"className":"wnl-sign-off"} -->
<p class="wnl-sign-off"><em><?php esc_html_e( 'Until next time.', 'writer-newsletter' ); ?></em></p>
<!-- /wp:paragraph -->
