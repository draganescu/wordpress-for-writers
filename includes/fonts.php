<?php
/**
 * The writing fonts: Geist Serif, Geist Sans and Roboto Mono, self-hosted from
 * assets/fonts/ (licences sit next to the files).
 *
 * They're added to the default origin of the site's theme.json data, the way
 * core registers its own presets, so they're WordPress fonts like any other:
 * - core prints their @font-face rules (wp_print_font_faces()) on the front
 *   end, on every admin screen including the app, and in the iframed editor
 *   canvas, which doesn't inherit @font-face from the page around it;
 * - any theme can use them: they're listed in the editor's font family
 *   controls and in Styles > Typography, and get the usual preset variables,
 *   such as var( --wp--preset--font-family--geist-serif ).
 *
 * A browser only downloads a face when text uses it, so listing them everywhere
 * costs nothing until something is set in one of them. In the app that's the
 * family the font option puts first in --wfw-font-body (includes/appearance.php),
 * plus Roboto Mono when a note has code (assets/editor-content.css), and an
 * italic or Latin Extended file only when the text has some.
 */

defined( 'ABSPATH' ) || exit;

/**
 * The font families as theme.json settings.typography.fontFamilies entries.
 */
function wfw_font_families() {
    $url = WFW_URL . 'assets/fonts/';

    // Subsets and ranges as Google Fonts serves them; the later Latin face wins where they overlap.
    $latin_ext = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
    $latin     = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

    $roboto_mono = array();
    foreach ( array( 'normal', 'italic' ) as $style ) {
        foreach ( array( 'latin-ext' => $latin_ext, 'latin' => $latin ) as $subset => $range ) {
            $roboto_mono[] = array(
                'fontFamily'   => 'Roboto Mono',
                'fontStyle'    => $style,
                'fontWeight'   => '100 700',
                'fontDisplay'  => 'swap',
                'src'          => array( $url . "roboto-mono/roboto-mono-{$subset}-wght-{$style}.woff2" ),
                'unicodeRange' => $range,
            );
        }
    }

    return array(
        array(
            'name'       => 'Geist Serif',
            'slug'       => 'geist-serif',
            'fontFamily' => '"Geist Serif", ui-serif, Georgia, serif',
            /*
             * One weight, no italic: bold and italic text in Geist Serif is
             * synthesized (the app keeps its title and large headings regular
             * instead). The static Regular rather than the variable file, whose
             * only axis is the shape of the dots and whose overlapping contours
             * come out hollow in bold.
             */
            'fontFace'   => array(
                array(
                    'fontFamily'  => 'Geist Serif',
                    'fontStyle'   => 'normal',
                    'fontWeight'  => '400',
                    'fontDisplay' => 'swap',
                    'src'         => array( $url . 'geist/GeistSerif-Regular.woff2' ),
                ),
            ),
        ),
        array(
            'name'       => 'Geist Sans',
            'slug'       => 'geist-sans',
            'fontFamily' => '"Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'fontFace'   => array(
                array(
                    'fontFamily'  => 'Geist Sans',
                    'fontStyle'   => 'normal',
                    'fontWeight'  => '100 900',
                    'fontDisplay' => 'swap',
                    'src'         => array( $url . 'geist/Geist-Variable.woff2' ),
                ),
                array(
                    'fontFamily'  => 'Geist Sans',
                    'fontStyle'   => 'italic',
                    'fontWeight'  => '100 900',
                    'fontDisplay' => 'swap',
                    'src'         => array( $url . 'geist/Geist-Italic-Variable.woff2' ),
                ),
            ),
        ),
        array(
            'name'       => 'Roboto Mono',
            'slug'       => 'roboto-mono',
            'fontFamily' => '"Roboto Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            'fontFace'   => $roboto_mono,
        ),
    );
}

/**
 * Appends the fonts to the default origin, after any families already there.
 * The theme's own fonts and those installed from the Font Library are other
 * origins, so they're untouched.
 */
add_filter( 'wp_theme_json_data_default', function ( $theme_json ) {
    $data     = $theme_json->get_data();
    $families = $data['settings']['typography']['fontFamilies'] ?? array();

    return $theme_json->update_with( array(
        'version'  => $data['version'],
        'settings' => array(
            'typography' => array(
                'fontFamilies' => array_merge( $families, wfw_font_families() ),
            ),
        ),
    ) );
} );
