<?php
/**
 * Title: Story introduction
 * Slug: writer-longform/story-dek
 * Categories: text
 * Description: A large italic standfirst that sets up the story, followed by a short rule.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:paragraph {"className":"wlf-dek","fontSize":"large"} -->
<p class="wlf-dek has-large-font-size"><?php esc_html_e( 'One sentence that tells readers why this story matters and what they will find if they stay with it.', 'writer-longform' ); ?></p>
<!-- /wp:paragraph -->

<!-- wp:separator {"className":"wlf-short-rule"} -->
<hr class="wp-block-separator has-alpha-channel-opacity wlf-short-rule"/>
<!-- /wp:separator -->
