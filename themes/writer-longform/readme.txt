=== Writer Longform ===
Contributors: wordpressforwriters
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A magazine-style block theme for long reads: full-bleed hero images, chapter headings, wide pull quotes and a grid of stories.

== Description ==

Writer Longform treats each post as a feature story. Headlines use Fraunces, body text uses Source Serif 4, and labels use Inter.

* Single story: a full-bleed hero built from the featured image with the category, title and byline set over it. Without a featured image the hero becomes a solid dark panel. The "Story with title below the image" template puts the title under a full-width image instead.
* Story text: the first paragraph opens with a drop cap and small capitals. Every Heading 2 becomes a numbered chapter heading (I, II, III…); pick the "Plain" heading style to leave one unnumbered.
* Wide and full-width images, galleries, covers and pull quotes break out of the text column.
* Home: the latest story as a full-width cover, then a responsive grid of story cards. Archives and search use the same grid.
* Style variations: the ten colour schemes of the Writer app's Appearance menu (System, Red Graphite, Charcoal, Toothpaste, Paper, Solarized Light, Solarized Dark, Dracula, Nord and WordPress), so the site can match the editor. System follows the reader's light or dark setting, like the app. Muted text and accents are nudged where needed to keep at least 4.5:1 contrast. With the WordPress for Writers plugin active, the site follows the colour scheme an administrator picks in the Writer app.
* Patterns: lead story, story grid, wide pull quote, chapter opening and story introduction.

= Writer Subscribe =

When the Writer Subscribe plugin is active, the theme shows its form after each story and in the footer, and adds a Subscribe button to the header. When the plugin isn't active those pieces don't render at all. The form is styled through the plugin's `--wsub-*` custom properties, so it follows the active style variation.

= Reading time =

The reading time is a Paragraph block bound to the `writer-longform/reading-time` block bindings source (230 words a minute).

== Changelog ==

= 0.1.0 =
* First release.

== Copyright ==

Writer Longform WordPress Theme, (C) 2026 WordPress for Writers.
Writer Longform is distributed under the terms of the GNU GPL v2 or later.

This theme bundles the following third-party resources:

Fraunces
Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
License: SIL Open Font License, Version 1.1 (assets/fonts/OFL-Fraunces.txt)

Source Serif 4
Copyright 2014 The Source Serif 4 Project Authors (https://github.com/adobe-fonts/source-serif)
License: SIL Open Font License, Version 1.1 (assets/fonts/OFL-SourceSerif4.txt)

Inter
Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
License: SIL Open Font License, Version 1.1 (assets/fonts/OFL-Inter.txt)

The fonts are the Latin subsets of the variable fonts.

Screenshot (screenshot.png)
Created by the theme author from the WordPress for Writers demo content. The landscape images in it are gradients generated for the screenshot, not photographs.
License: CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/)
