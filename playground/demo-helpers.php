<?php
/**
 * Block-markup helpers shared by the Playground demo scripts.
 */

defined( 'ABSPATH' ) || exit;

function demo_p( $text ) {
    return "<!-- wp:paragraph -->\n<p>$text</p>\n<!-- /wp:paragraph -->\n\n";
}
function demo_h( $text, $level = 2 ) {
    $attrs = 2 === $level ? '' : ' {"level":' . $level . '}';
    return "<!-- wp:heading$attrs -->\n<h$level class=\"wp-block-heading\">$text</h$level>\n<!-- /wp:heading -->\n\n";
}
function demo_quote( $text, $cite = '' ) {
    $cite = $cite ? "<cite>$cite</cite>" : '';
    return "<!-- wp:quote -->\n<blockquote class=\"wp-block-quote\"><!-- wp:paragraph -->\n<p>$text</p>\n<!-- /wp:paragraph -->$cite</blockquote>\n<!-- /wp:quote -->\n\n";
}
function demo_list( $items, $ordered = false ) {
    $tag   = $ordered ? 'ol' : 'ul';
    $attrs = $ordered ? ' {"ordered":true}' : '';
    $li    = '';
    foreach ( $items as $item ) {
        $li .= "<!-- wp:list-item -->\n<li>$item</li>\n<!-- /wp:list-item -->\n";
    }
    return "<!-- wp:list$attrs -->\n<$tag class=\"wp-block-list\">$li</$tag>\n<!-- /wp:list -->\n\n";
}
function demo_hr() {
    return "<!-- wp:separator -->\n<hr class=\"wp-block-separator has-alpha-channel-opacity\"/>\n<!-- /wp:separator -->\n\n";
}
