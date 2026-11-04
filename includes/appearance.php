<?php
/**
 * Bear-style appearance: themes, fonts, text size and line width.
 *
 * A single set of CSS custom properties (--wfw-*) drives the app, the editor
 * chrome and the editor canvas. Choices are stored per user and applied as
 * data attributes on each document's root element.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Theme palettes. "system" follows the OS light/dark setting.
 */
function wfw_themes() {
    return array(
        'red-graphite'    => array(
            'label'  => __( 'Red Graphite', 'wordpress-for-writers' ),
            'dark'   => false,
            'colors' => array(
                'sidebar' => '#f3f2f0', 'sidebarFg' => '#4a4a4a', 'sidebarMuted' => '#9a9895', 'hover' => '#e5e3e0',
                'list' => '#fafaf9', 'active' => '#ecebe9', 'border' => '#e6e4e1', 'bg' => '#ffffff',
                'text' => '#333333', 'muted' => '#8d8b88', 'accent' => '#dd4c4f', 'code' => '#f3f2f0', 'mark' => '#fbe7a1',
            ),
        ),
        'charcoal'        => array(
            'label'  => __( 'Charcoal', 'wordpress-for-writers' ),
            'dark'   => true,
            'colors' => array(
                'sidebar' => '#1f2023', 'sidebarFg' => '#c9c9c9', 'sidebarMuted' => '#6f7175', 'hover' => '#2e3034',
                'list' => '#26272a', 'active' => '#34363a', 'border' => '#36383c', 'bg' => '#2b2c30',
                'text' => '#dcdcdc', 'muted' => '#8a8c90', 'accent' => '#dd4c4f', 'code' => '#36383c', 'mark' => '#6b5a1e',
            ),
        ),
        'toothpaste'      => array(
            'label'  => __( 'Toothpaste', 'wordpress-for-writers' ),
            'dark'   => false,
            'colors' => array(
                'sidebar' => '#eef6f7', 'sidebarFg' => '#3d4c52', 'sidebarMuted' => '#8ea3a8', 'hover' => '#ddecee',
                'list' => '#f7fbfb', 'active' => '#e3eff1', 'border' => '#dfeaec', 'bg' => '#ffffff',
                'text' => '#36454b', 'muted' => '#8a9ca1', 'accent' => '#00a2b5', 'code' => '#eef6f7', 'mark' => '#c9f0f0',
            ),
        ),
        'paper'           => array(
            'label'  => __( 'Paper', 'wordpress-for-writers' ),
            'dark'   => false,
            'colors' => array(
                'sidebar' => '#f1ece2', 'sidebarFg' => '#5a4a32', 'sidebarMuted' => '#a8987c', 'hover' => '#e6dfd1',
                'list' => '#f8f4ec', 'active' => '#ece5d7', 'border' => '#e6dfd1', 'bg' => '#fbf8f2',
                'text' => '#3d3122', 'muted' => '#9c8b6e', 'accent' => '#b0793a', 'code' => '#efe8da', 'mark' => '#f2dfae',
            ),
        ),
        'solarized-light' => array(
            'label'  => __( 'Solarized Light', 'wordpress-for-writers' ),
            'dark'   => false,
            'colors' => array(
                'sidebar' => '#eee8d5', 'sidebarFg' => '#586e75', 'sidebarMuted' => '#93a1a1', 'hover' => '#e4ddc8',
                'list' => '#f7f1df', 'active' => '#ebe4cf', 'border' => '#e4ddc8', 'bg' => '#fdf6e3',
                'text' => '#586e75', 'muted' => '#93a1a1', 'accent' => '#cb4b16', 'code' => '#eee8d5', 'mark' => '#f3dc8b',
            ),
        ),
        'solarized-dark'  => array(
            'label'  => __( 'Solarized Dark', 'wordpress-for-writers' ),
            'dark'   => true,
            'colors' => array(
                'sidebar' => '#00212b', 'sidebarFg' => '#93a1a1', 'sidebarMuted' => '#586e75', 'hover' => '#073642',
                'list' => '#00262f', 'active' => '#073642', 'border' => '#0a3c48', 'bg' => '#002b36',
                'text' => '#93a1a1', 'muted' => '#657b83', 'accent' => '#cb4b16', 'code' => '#073642', 'mark' => '#5b4a0f',
            ),
        ),
        'dracula'         => array(
            'label'  => __( 'Dracula', 'wordpress-for-writers' ),
            'dark'   => true,
            'colors' => array(
                'sidebar' => '#21222c', 'sidebarFg' => '#c7c9d3', 'sidebarMuted' => '#6272a4', 'hover' => '#343746',
                'list' => '#262833', 'active' => '#373a4a', 'border' => '#343746', 'bg' => '#282a36',
                'text' => '#f8f8f2', 'muted' => '#8c93b8', 'accent' => '#ff79c6', 'code' => '#343746', 'mark' => '#6b5a2a',
            ),
        ),
        'nord'            => array(
            'label'  => __( 'Nord', 'wordpress-for-writers' ),
            'dark'   => true,
            'colors' => array(
                'sidebar' => '#2e3440', 'sidebarFg' => '#d8dee9', 'sidebarMuted' => '#7b88a1', 'hover' => '#3b4252',
                'list' => '#323946', 'active' => '#434c5e', 'border' => '#3b4252', 'bg' => '#353c4a',
                'text' => '#e5e9f0', 'muted' => '#8f9bb3', 'accent' => '#88c0d0', 'code' => '#3b4252', 'mark' => '#5e5537',
            ),
        ),
    );
}

function wfw_appearance_options() {
    return array(
        'theme' => array_merge( array( 'system' ), array_keys( wfw_themes() ) ),
        'font'  => array( 'serif', 'sans', 'mono' ),
        'size'  => array( 'small', 'medium', 'large' ),
        'width' => array( 'narrow', 'medium', 'wide' ),
    );
}

function wfw_appearance_defaults() {
    return array(
        'theme' => 'system',
        'font'  => 'serif',
        'size'  => 'medium',
        'width' => 'medium',
    );
}

function wfw_sanitize_appearance( $value ) {
    $value   = is_array( $value ) ? $value : array();
    $clean   = wfw_appearance_defaults();
    $options = wfw_appearance_options();
    foreach ( $options as $key => $allowed ) {
        if ( isset( $value[ $key ] ) && in_array( $value[ $key ], $allowed, true ) ) {
            $clean[ $key ] = $value[ $key ];
        }
    }
    return $clean;
}

function wfw_get_appearance( $user_id = 0 ) {
    $user_id = $user_id ? $user_id : get_current_user_id();
    return wfw_sanitize_appearance( get_user_meta( $user_id, 'wfw_appearance', true ) );
}

add_action( 'init', function () {
    $properties = array();
    foreach ( wfw_appearance_options() as $key => $allowed ) {
        $properties[ $key ] = array(
            'type' => 'string',
            'enum' => $allowed,
        );
    }
    register_meta( 'user', 'wfw_appearance', array(
        'type'              => 'object',
        'single'            => true,
        'default'           => wfw_appearance_defaults(),
        'sanitize_callback' => 'wfw_sanitize_appearance',
        'show_in_rest'      => array(
            'schema' => array(
                'type'                 => 'object',
                'context'              => array( 'edit' ),
                'properties'           => $properties,
                'additionalProperties' => false,
            ),
        ),
    ) );
} );

/**
 * Colors of the note list's status icons: one set for light palettes and one for
 * dark, each at least 3:1 against every palette's list and selected-row backgrounds.
 */
function wfw_status_colors( $dark ) {
    return $dark
        ? array( 'publish' => '#5cc98a', 'future' => '#6aa8f0', 'draft' => '#e6c04a' )
        : array( 'publish' => '#1e8a3e', 'future' => '#2a6fc0', 'draft' => '#a67c00' );
}

/**
 * CSS for every theme, font, size and width, keyed off root data attributes.
 */
function wfw_appearance_css() {
    $map = array(
        'sidebar'      => 'sidebar-bg',
        'sidebarFg'    => 'sidebar-fg',
        'sidebarMuted' => 'sidebar-muted',
        'hover'        => 'sidebar-active',
        'list'         => 'list-bg',
        'active'       => 'list-active',
        'border'       => 'border',
        'bg'           => 'editor-bg',
        'text'         => 'text',
        'muted'        => 'muted',
        'accent'       => 'accent',
        'code'         => 'code-bg',
        'mark'         => 'mark',
    );

    $declarations = function ( $theme ) use ( $map ) {
        $css = 'color-scheme:' . ( $theme['dark'] ? 'dark' : 'light' ) . ';';
        foreach ( $theme['colors'] as $key => $color ) {
            $css .= '--wfw-' . $map[ $key ] . ':' . $color . ';';
        }
        foreach ( wfw_status_colors( $theme['dark'] ) as $status => $color ) {
            $css .= '--wfw-status-' . $status . ':' . $color . ';';
        }
        return $css . '--wfw-list-fg:var(--wfw-text);--wfw-list-muted:var(--wfw-muted);';
    };

    $themes = wfw_themes();
    $css    = ':root,:root[data-wfw-theme="system"]{' . $declarations( $themes['red-graphite'] ) . '}';
    $css   .= '@media (prefers-color-scheme: dark){:root[data-wfw-theme="system"]{' . $declarations( $themes['charcoal'] ) . '}}';
    foreach ( $themes as $id => $theme ) {
        $css .= ':root[data-wfw-theme="' . $id . '"]{' . $declarations( $theme ) . '}';
    }

    $css .= ':root{--wfw-font-ui:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}';
    $css .= ':root,:root[data-wfw-font="serif"]{--wfw-font-body:ui-serif,"New York","Iowan Old Style",Charter,"Bitstream Charter",Georgia,serif;}';
    $css .= ':root[data-wfw-font="sans"]{--wfw-font-body:"Avenir Next",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}';
    $css .= ':root[data-wfw-font="mono"]{--wfw-font-body:ui-monospace,"SF Mono",Menlo,Consolas,monospace;}';
    $css .= ':root[data-wfw-size="small"]{--wfw-size:16px;}';
    $css .= ':root,:root[data-wfw-size="medium"]{--wfw-size:18px;}';
    $css .= ':root[data-wfw-size="large"]{--wfw-size:20px;}';
    $css .= ':root[data-wfw-width="narrow"]{--wfw-measure:600px;}';
    $css .= ':root,:root[data-wfw-width="medium"]{--wfw-measure:720px;}';
    $css .= ':root[data-wfw-width="wide"]{--wfw-measure:880px;}';

    return $css;
}

/**
 * Inline script that stamps the user's choices on <html> before paint.
 */
function wfw_appearance_bootstrap_script() {
    $attrs = array();
    foreach ( wfw_get_appearance() as $key => $value ) {
        $attrs[ 'wfw' . ucfirst( $key ) ] = $value;
    }
    return 'Object.assign(document.documentElement.dataset,' . wp_json_encode( $attrs ) . ');';
}

/**
 * Data the app needs to render the appearance picker.
 */
function wfw_appearance_client_data() {
    $themes = array(
        array(
            'id'     => 'system',
            'label'  => __( 'System', 'wordpress-for-writers' ),
            'swatch' => array( '#ffffff', '#2b2c30', '#dd4c4f' ),
        ),
    );
    foreach ( wfw_themes() as $id => $theme ) {
        $themes[] = array(
            'id'     => $id,
            'label'  => $theme['label'],
            'swatch' => array( $theme['colors']['bg'], $theme['colors']['text'], $theme['colors']['accent'] ),
        );
    }
    return array(
        'current' => wfw_get_appearance(),
        'themes'  => $themes,
    );
}
