=== Writer Essay ===
Contributors: wordpressforwriters
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

An elegant long-read block theme with a large serif title, generous whitespace, an optional drop cap and an author bio after every essay.

== Description ==

Writer Essay is for long, considered pieces. Body text is set in Literata at a comfortable measure, and the interface around it (header, bylines, labels) uses a quiet sans serif so it stays out of the way.

* Header: one slim row with the site title, navigation and a Subscribe button.
* Home: the latest essay, large, followed by a list with category, excerpt, date, reading time and an optional thumbnail.
* Single essay: a large serif title, a byline with avatar, reading time and date, a wide featured image, tags, and a clean author bio (from the user's Biographical Info) at the end.
* Drop cap: pick the "Essay with drop cap" template for a post, or the "Drop cap" style on the Content block. Paragraphs also support the editor's own drop cap.
* Style variations: the ten colour schemes of the Writer app's Appearance menu (System, Red Graphite, Charcoal, Toothpaste, Paper, Solarized Light, Solarized Dark, Dracula, Nord and WordPress), so the site can match the editor. System follows the reader's light or dark setting, like the app. Muted text and accents are nudged where needed to keep at least 4.5:1 contrast. With the WordPress for Writers plugin active, the site follows the colour scheme an administrator picks in the Writer app.
* Patterns: featured essay, essay list, centred pull quote and an author's note.

= Writer Subscribe =

When the Writer Subscribe plugin is active, the theme shows its form after the author bio and in the footer, and adds a Subscribe button to the header. When the plugin isn't active those pieces don't render at all. The form is styled through the plugin's `--wsub-*` custom properties, so it follows the active style variation.

= Reading time =

The reading time is a Paragraph block bound to the `writer-essay/reading-time` block bindings source (230 words a minute).

== Changelog ==

= 0.1.0 =
* First release.

== Copyright ==

Writer Essay WordPress Theme, (C) 2026 WordPress for Writers.
Writer Essay is distributed under the terms of the GNU GPL v2 or later.

This theme bundles the following third-party resources:

Literata
Copyright 2017 The Literata Project Authors (https://github.com/googlefonts/literata)
License: SIL Open Font License, Version 1.1 (assets/fonts/OFL-Literata.txt)

Inter
Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
License: SIL Open Font License, Version 1.1 (assets/fonts/OFL-Inter.txt)

The fonts are the Latin subsets of the variable fonts.
