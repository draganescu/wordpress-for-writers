=== Words for Writers ===
Contributors: andraganescu
Tags: writing, editor, distraction-free, notes, admin
Requires at least: 7.1
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.8.2
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

A calm writing app in place of the dashboard: a library of categories and tags, a list of notes, and a quiet block editor.

== Description ==

Words for Writers gives the people who write on your site a writing app instead of the WordPress dashboard. It has three panes: a library on the left (your drafts, published and scheduled posts, categories and tags), a list of notes in the middle, and a distraction-free editor on the right.

It is still the block editor underneath, and every note is an ordinary WordPress post. Nothing is stored in a format of its own, and switching the plugin off leaves your posts exactly as they are.

= It takes over the dashboard for writers =

Once the plugin is active, writers are sent to the app instead of the dashboard, both after they log in and whenever they open `/wp-admin/`. Please know this before you activate it on a busy site.

* **Who gets the app:** everyone who can write posts (the `edit_posts` capability): Contributors, Authors, Editors and Administrators. To narrow it down, filter `wfw_capability`, for example to `edit_pages` for Editors and up. Everyone else keeps the standard dashboard, and if they open the app's page they are told why.
* **WordPress still decides what each role can do.** Contributors submit notes for review instead of publishing, and cannot upload images or add categories.
* **Getting to the classic dashboard:** choose **Go to admin** in the account menu at the foot of the sidebar, or open `/wp-admin/index.php?wfw_classic=1`. Every other admin screen (Plugins, Settings, Users and so on) works as usual.
* **Updates and notices:** admin notices are hidden on the app's page so it can use the whole screen. Pending WordPress, plugin and theme updates still show: as a dot on your account button and an **Updates** item at the top of the account menu, for the people who can install them.

= What you can do in it =

* **Library:** Notes, Drafts, Published, Scheduled and Trash with counts, nested categories and tags. Pin a category or tag to the top of the library.
* **Note list:** title, excerpt, date and status, with search and infinite scroll. Trash, restore or delete from the list.
* **Editor:** the block editor without the chrome. The formatting toolbar floats at the bottom, save and publish sit at the top right, and there are no block inserters in the way. Drafts save as you type. Open a note in wp-admin's full editor from its settings when you need meta boxes or plugin sidebars.
* **Tabs:** keep up to six notes open as tabs, each with its own place and unsaved changes.
* **Peek:** read another note in a sheet beside the one you are writing, without leaving it.
* **Quick notes:** start a status, image, gallery, video or audio post in its post format, with its block already in place.
* **Command palette:** Cmd/Ctrl+K to switch tabs, open a note by title or run an action.
* **Appearance:** ten colour themes, three fonts, three text sizes and three line widths, saved per user.
* **Phones and tablets:** one pane at a time on a phone, a drawer for the library on a tablet, and you can add the app to your home screen.

= Privacy =

The plugin makes no requests to outside services and collects no data. It sends nothing anywhere: the app only talks to your own site's REST API. Each user's appearance choices and pinned categories are saved as their user meta on your site, and a few interface preferences (open tabs, the list's view) are kept in their own browser's local storage.

= Source code =

The JavaScript and CSS in the plugin are the unminified source; there is no build step. Development happens on GitHub: https://github.com/draganescu/wordpress-for-writers

The same repository also holds separate companion plugins and themes. They are not part of this plugin and are not needed to use it.

== Installation ==

1. In your dashboard, go to **Plugins → Add New**, search for "Words for Writers", then install and activate it. Or upload the `words-for-writers` folder to `/wp-content/plugins/` and activate it from the Plugins screen.
2. You are taken to the app the next time you open the dashboard. Writers see it after they next log in.

The plugin needs WordPress 7.1 or newer and PHP 7.4 or newer. There are no settings to configure.

== Frequently Asked Questions ==

= How do I get back to the normal dashboard? =

Choose **Go to admin** in the account menu (click your name at the foot of the sidebar), or open `/wp-admin/index.php?wfw_classic=1`. The rest of wp-admin is unchanged.

= Can I keep the app to some roles only? =

Yes. Filter `wfw_capability` with the capability a user needs. For example, to give the app to Editors and Administrators only:

`add_filter( 'wfw_capability', function () { return 'edit_pages'; } );`

= Where did the admin notices go? =

They are hidden on the app's page only, so it can use the whole screen. They show as usual on every other admin screen. Pending updates are shown in the app's account menu.

= Does it change my posts or my theme? =

Your posts stay ordinary posts; the app edits them through the block editor. The editor shows notes on a plain writing surface instead of your theme's styles, which only changes how they look while you write. The one exception is a theme that opts in with `add_theme_support( 'wfw-color-schemes' )`: there, when someone who can edit the site's appearance picks a colour scheme in the app, the site's colours follow it. Turn that off with `add_filter( 'wfw_sync_site_color_scheme', '__return_false' );`. No theme in the WordPress.org directory opts in unless its author added this.

= Does it work with other plugins' blocks? =

The app's editor offers core's writing and media blocks. A note that already contains another plugin's block still shows and edits it, and wp-admin's full editor is one click away in the note's settings.

= What is removed when I delete the plugin? =

Deleting the plugin from the Plugins screen removes each user's appearance preferences and pinned categories and tags (the `wfw_appearance` and `wfw_pinned_terms` user meta, on every site of a network). Posts, categories and tags written in the app stay, and so do site colours set from the app's colour schemes, since they are part of the site's look.

= Does it send any data anywhere? =

No. The plugin makes no external requests and collects no data.

== Screenshots ==

1. The app on a desktop: the library, the note list and the editor.
2. The editor on a phone, with the floating formatting toolbar.
3. The categories and tags form, opened from above a note's title: tick categories and add tags, and each change saves to the note.

== Changelog ==

= 0.8.2 =
* First release in the WordPress.org plugin directory.
* The app's own words (buttons, menus, messages) can now be translated.
* Links added to the sidebar by other plugins open only web addresses (http and https).

= 0.8.1 =
* A note without a title shows in the list by its post format.
* The installed app opens in wp-admin, and the note list runs to the foot of the screen.

== Upgrade Notice ==

= 0.8.2 =
First release in the WordPress.org plugin directory.
