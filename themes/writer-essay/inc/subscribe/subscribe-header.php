<?php
/**
 * Header call to action: jumps to the subscribe form on the page.
 *
 * @package writer-essay
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:buttons {"className":"wes-header-cta","layout":{"type":"flex","justifyContent":"right"}} -->
<div class="wp-block-buttons wes-header-cta">
    <!-- wp:button -->
    <div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#subscribe"><?php esc_html_e( 'Subscribe', 'writer-essay' ); ?></a></div>
    <!-- /wp:button -->
</div>
<!-- /wp:buttons -->
