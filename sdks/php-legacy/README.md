# webhook-platform/php (deprecated)

**This package has been renamed to [`hookflow/php`](../php).** Require that
instead:

```bash
composer remove webhook-platform/php
composer require hookflow/php
```

The `Hookflow\` namespace does not change — only the Packagist package name.

## Why this package still exists

`webhook-platform/php` was already published to Packagist (v2.2.1) before
the product-wide rename to Hookflow was finished. Packagist does not allow
renaming or reusing a package name, so rather than abandon everyone who
already depends on `webhook-platform/php`, this package stays published as a
Composer [metapackage](https://getcomposer.org/doc/04-schema.md#type) — no
source code of its own, just a `require: hookflow/php` constraint.
`composer require webhook-platform/php` keeps working; it just pulls in
`hookflow/php` under the hood.

No new features or fixes land here — only in `hookflow/php`. Migrate your
`composer.json` when convenient.

## Publishing note (maintainers) — repo topology caveat

Packagist ties one package to one `composer.json`-at-repo-root per
repository; it does not read a subdirectory of this monorepo. The currently
published `webhook-platform/php` package is in fact backed by a **separate**
repository (`github.com/vadymkykalo/webhook-platform-php`), not this
monorepo — confirmed by its Packagist metadata (`source.url`). That means:

- **This shim's `composer.json`** needs to be pushed to that existing
  `webhook-platform-php` repo (tag e.g. `v2.2.2`) for Packagist to pick it
  up as a real deprecation release — copying it from here is the easiest
  path, since `sdks/php-legacy` in this monorepo is not itself
  Packagist-visible.
- **The new `hookflow/php` package** has never been published, so it needs
  its own Packagist submission. Follow the same pattern the existing SDK
  uses (a dedicated `hookflow-php` repo, or whatever split/export mechanism
  replaces it) rather than pointing Packagist at this monorepo directly —
  `sdks/php` here is the source of truth to sync from, matching how
  `sdks/php` already relates to `webhook-platform-php` today.

This monorepo directory (`sdks/php-legacy`) is the source of truth for the
shim's `composer.json`/README; it is not itself submitted to Packagist.

## License

MIT
