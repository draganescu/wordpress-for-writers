<?php
/**
 * Header call to action: jumps to the subscribe form on the page.
 *
 * @package writer-newsletter
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:buttons {"className":"wnl-header-cta","layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons wnl-header-cta">
    <!-- wp:button -->
    <div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#subscribe"><?php esc_html_e( 'Subscribe', 'writer-newsletter' ); ?></a></div>
    <!-- /wp:button -->
</div>
<!-- /wp:buttons -->
