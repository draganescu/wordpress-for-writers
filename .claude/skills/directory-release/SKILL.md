---
name: directory-release
description: Prepare a WordPress.org directory release of the root plugin as Words for Writers, before tagging. Drafts the changelog entry in directory/readme.txt from commits since the last words-for-writers-v* tag, checks Tested up to against the current stable WordPress, builds with bin/build-directory.sh, runs Plugin Check, summarises anything new and shows the diff against the previous directory release. Use when asked to prepare, check or get ready a directory / WordPress.org / Words for Writers release, or "what do I tag for the directory". Never tags or pushes.
---

# Prepare a directory release

The root plugin (trunk name "WordPress for Writers") is published to the
WordPress.org directory as a generated variant, **Words for Writers**
(`words-for-writers`). `bin/build-directory.sh` makes it; the `Directory
release` workflow (`.github/workflows/directory.yml`) publishes it when the
plugin's release tag is pushed. This skill gets everything ready for that tag.

**Never create tags, push, commit to the `directory` branch, or touch SVN.**
Edit only `directory/readme.txt` (and trunk code, if the user asks you to fix
something Plugin Check found). End by telling the user what to tag.

## Steps

### 1. Versions

- The version being released is the `Version:` header of
  `wordpress-for-writers.php` (`bin/build-zips.sh --list wordpress-for-writers`).
  `WFW_VERSION` in the same file and `package.json` should match it; say so if
  they don't.
- The previous directory release is the newest `words-for-writers-v*` tag:
  `git fetch --tags origin` then
  `git tag -l 'words-for-writers-v*' --sort=-v:refname | head -n 1`.
  With no such tag, this is the first directory release: compare against
  nothing and say so.
- If a `words-for-writers-v<version>` tag already exists, stop: that version
  is already published. The header needs a bump first.

### 2. Draft the changelog entry

- List the commits to the root plugin since the previous release. The tag is
  on the `directory` branch, whose commit message ends in "from <trunk sha>";
  read the full sha from its body ("Built by bin/build-directory.sh from …")
  and run:
  `git log --no-merges --format='%h %s' <sha>..HEAD -- wordpress-for-writers.php uninstall.php includes assets`
  Ignore changes under `plugins/`, `themes/`, `playground/`, `bin/`,
  `directory/` and `.github/`: they are not in the plugin.
- Write `= <version> =` under `== Changelog ==` in `directory/readme.txt`,
  newest first, as bullets for people who use the plugin: what they will
  notice, in plain words, one line each. Leave out refactors, review fixes and
  commits that only bump versions. Don't call it "WordPress for Writers"; in
  the readme it is Words for Writers, or "the app".
- If the entry already exists, compare it with the commits and suggest what is
  missing rather than rewriting it.
- Update `== Upgrade Notice ==` only if the release needs one (something a site
  owner must know before updating); keep it under 300 characters.

### 3. Tested up to

- Get the current stable WordPress version:
  `curl -s https://api.wordpress.org/core/version-check/1.7/` and read
  `offers[0].current` (for example `7.1.5`).
- `Tested up to` takes the major version only (`7.1`). Set it to the current
  stable major if it's lower, never higher. Tell the user it was raised and
  that they should confirm the plugin was actually tested on it.
- `Requires at least` (readme) must equal the plugin's `Requires at least`
  header; `Requires PHP` likewise.

### 4. Build

Run `bin/build-directory.sh --zip`. It fails, with a reason per check, when the
old name or slug is left anywhere but the GitHub URL, a PHP file fails
`php -l`, the readme has no changelog entry for the version, or the zip is over
10 MB. Fix the cause (in trunk code or `directory/readme.txt`) and run it
again. Never weaken the script's checks to get past a failure.

### 5. Plugin Check

Run `bin/plugin-check.sh`. It starts a throwaway wp-env site on port 8892 with
only the variant and the Plugin Check plugin, checks every category, writes
`build/plugin-check.csv` and stops the site. It needs Docker running and
`npm install` done. Errors fail the release workflow, so they must be fixed on
trunk before tagging. Warnings don't fail it, but report each one.

### 6. Summarise what's new

Compare against the previous release so the user only reads what changed:

- **Plugin Check:** check out the previous tag's tree into a scratch folder
  (`git worktree add <scratch>/prev words-for-writers-v<prev>`), and only if
  there are findings now, say which are new since then (by file, sniff code
  and message; line numbers move).
- **Readme:** anything new the directory will show: changelog, a changed
  `Tested up to`, `Requires at least` or `Requires PHP`, new FAQ or screenshots.
- **Behaviour reviewers care about:** new external requests (grep the build
  for `wp_remote_`, `fetch(`, `http://`, `https://`), new options, user meta,
  tables, cron events or REST routes (and whether `uninstall.php` cleans them
  up), new `phpcs:ignore` comments (each needs a reason after `--`), new
  innerHTML that interpolates values without `esc()`, new admin notices or
  redirects, new files in the zip. If the readme's Privacy section or
  uninstall FAQ no longer matches the code, say so.

### 7. Diff against the previous directory release

Show the user what wordpress.org will receive compared with what it has:

```bash
git diff --no-index --stat <scratch>/prev build/words-for-writers
git diff --no-index <scratch>/prev build/words-for-writers
```

Summarise it by
file; show the full diff for `readme.txt` and the main file's header. Remove
the scratch worktree afterwards (`git worktree remove <scratch>/prev`).

### 8. Hand over

Finish with:

- the changelog entry as written, and any readme changes;
- the Plugin Check result (clean, or the findings, new ones marked);
- anything a reviewer could question;
- what's left uncommitted (`git status --short`), so the user can commit
  `directory/readme.txt` to trunk first;
- **what to tag**: `wordpress-for-writers-v<version>` on the trunk commit that
  has the readme change, for example
  `git tag wordpress-for-writers-v<version> && git push origin wordpress-for-writers-v<version>`.
  Say that the workflow then builds, runs Plugin Check, and commits and tags
  `words-for-writers-v<version>` on the `directory` branch, and that the
  WordPress.org deploy waits for approval of the `wordpress-org` environment,
  and only runs at all once the `DIRECTORY_APPROVED` repository variable is
  `true`.

Do not run the tag command yourself.
