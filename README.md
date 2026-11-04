# WordPress for Writers

[![Try it in WordPress Playground](https://img.shields.io/badge/Try%20it%20in-WordPress%20Playground-3858e9?logo=wordpress&logoColor=white)](https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/draganescu/wordpress-for-writers/trunk/blueprint.json)

A WordPress plugin that replaces wp-admin with a calm, three-pane writing app inspired by [Bear](https://bear.app): a library sidebar, a note list, and a distraction-free editor.

It still runs on the block editor, so your posts stay ordinary WordPress posts. The plugin only changes how you get to them and how writing feels.

![Writer app on desktop: library sidebar, note list and editor](screenshots/desktop.png)

<p align="center"><img src="screenshots/mobile.png" alt="Writer app on a phone: full-screen editor with the floating formatting bar" width="320"></p>

## Features

- **Takeover:** writers land in the Writer app instead of the dashboard, both after logging in and when opening `/wp-admin/`.
- **Library sidebar:** Notes, Drafts, Published, Scheduled and Trash with counts, nested categories, and `#tags`.
- **Note list:** title, excerpt, last-modified date and status, plus search and infinite scroll. You can trash, restore or delete permanently from the list.
- **Editor:**
  - It's the real block editor with the wp-admin chrome removed.
  - Theme styles are dropped in favour of a clean default writing surface.
  - The formatting toolbar floats at the bottom, and save/publish sits at the top right.
  - No block inserters or "Type / to choose a block" coaching.
- **Autosave for drafts:** drafts save themselves as you type. Published posts still need an explicit Update.
- **Live titles:** the note list updates as you type a title.
- **Appearance:** 10 themes (System, Red Graphite, Charcoal, Toothpaste, Paper, Solarized Light/Dark, Dracula, Nord, and WordPress in wp-admin's Modern colours), plus font (serif, sans, mono), text size and line width. Choices are saved per user and apply live.
- **Responsive:** on tablets the sidebar becomes a drawer, and on phones you see one pane at a time with back navigation.
- **Focus mode:** hides everything but the editor.

## Try it

The **Try it in WordPress Playground** button opens a disposable WordPress in your browser with the plugin active and a demo blog, "The Slow Margin", already written. Nothing is installed and nothing is saved. The setup lives in `blueprint.json`, and the demo posts in `playground/demo-content.php`.

## Install

Copy or clone this folder into `wp-content/plugins/` and activate **WordPress for Writers**. Requires WordPress 6.5+ and PHP 7.4+.

To reach the classic dashboard, use **Classic dashboard** in the sidebar footer (`/wp-admin/index.php?wfw_classic=1`). The settings sidebar (categories, tags, status, excerpt) opens with **Cmd/Ctrl + Shift + ,**.

Deleting the plugin from the Plugins screen removes each user's appearance preferences (the `wfw_appearance` user meta). Your posts, tags and categories stay, and so do any site global styles set from the app's colour scheme, since they are the site's look.

## Companion plugins

These live in `plugins/` and are separate plugins. Install each by copying its folder into `wp-content/plugins/`.

- [Writer Subscribe](plugins/writer-subscribe/README.md): a scroll-triggered subscribe popup, an inline form block, double opt-in and a streamed CSV export that handles very large lists.
- [Writer Members](plugins/writer-members/README.md): membership tiers, a Paywall block and per-post gating (also in feeds and the REST API), with a minimal Stripe webhook for Payment Links.

Companion plugins can add links to the user menu in the Writer sidebar with the `wfw_sidebar_links` filter. Each item is `array( 'label' => '', 'url' => '', 'icon' => '' )`; `icon` is optional and names one of the app's icons.

They can also add a **Visibility** picker to the note's settings with the `wfw_visibility_options` filter (items are `array( 'value' => '', 'label' => '' )`). The choice is saved to the post meta named by `wfw_visibility_meta_key` (default `wmem_tier`), which must be registered with `show_in_rest`. With no options, there is no picker.

## Development

There is no build step. Plain PHP, CSS and JavaScript use the `wp.*` globals.

```bash
npm install
npx wp-env start   # http://localhost:8890/wp-admin (admin / password)
npx wp-env stop
```

### Layout

- `wordpress-for-writers.php`: admin takeover, redirects, asset loading, and editor-frame settings (theme styles stripped, canvas CSS injected).
- `includes/appearance.php`: theme palettes, font/size/width options, user meta, and generated CSS tokens.
- `assets/app.js`, `assets/app.css`: the three-pane app.
- `assets/frame.js`, `assets/frame.css`: run inside the embedded block editor. They handle messaging with the app, draft autosave, the fixed bottom toolbar, and theming of the editor UI.
- `assets/editor-content.css`: the default writing surface inside the editor canvas.
- `blueprint.json`, `playground/demo-content.php`: the Playground demo.

## Releases

The Writer plugin, each plugin in `plugins/` and each theme in `themes/` ships as its own zip. Each zip unpacks to a folder named after the package, so it installs from **Plugins → Add New → Upload** or **Themes → Add New → Upload** like any other.

```bash
bin/build-zips.sh --list             # packages and their versions
bin/build-zips.sh                    # every zip, into build/
bin/build-zips.sh writer-subscribe   # just one
```

To publish, bump the `Version:` header, then push a tag. The `Release zips` workflow builds the zips and attaches them to a GitHub release.

- `writer-subscribe-v0.2.0` releases one package. The workflow fails if the tag doesn't match the package's `Version:` header.
- `v0.2.0` releases a bundle with every package.
- Running the workflow by hand builds every zip as an artifact, without publishing a release.

Dev files (`node_modules`, `package.json`, `.wp-env.json` and so on) are left out. The Writer plugin's zip also leaves out the `plugins/`, `themes/`, Playground and screenshot folders. To leave out more from one package, add a `.distignore` file to its folder with rsync patterns, one per line.

## License

GPL-2.0-or-later
