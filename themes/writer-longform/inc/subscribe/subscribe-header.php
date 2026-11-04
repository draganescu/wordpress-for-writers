<?php
/**
 * Header call to action: jumps to the subscribe form on the page.
 *
 * @package writer-longform
 */

defined( 'ABSPATH' ) || exit;
?>
<!-- wp:buttons {"className":"wlf-header-cta","layout":{"type":"flex","justifyContent":"right"}} -->
<div class="wp-block-buttons wlf-header-cta">
    <!-- wp:button -->
    <div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="#subscribe"><?php esc_html_e( 'Subscribe', 'writer-longform' ); ?></a></div>
    <!-- /wp:button -->
</div>
<!-- /wp:buttons -->
