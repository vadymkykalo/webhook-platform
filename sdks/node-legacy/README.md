# @webhook-platform/node (deprecated)

**This package has been renamed to [`@hookflow/node`](../node).** Install
that instead:

```bash
npm uninstall @webhook-platform/node
npm install @hookflow/node
```

```diff
- import { Hookflow } from '@webhook-platform/node';
+ import { Hookflow } from '@hookflow/node';
```

## Why this package still exists

`@webhook-platform/node` was already published to npm (v2.2.1) before the
product-wide rename to Hookflow was finished. Package names can't be renamed
or reused on npm once published, so rather than abandon everyone who already
depends on `@webhook-platform/node`, this package stays alive as a thin
shim: it depends on `@hookflow/node` and re-exports everything from it. Your
existing `import { Hookflow } from '@webhook-platform/node'` keeps working —
you'll just see a deprecation warning on import (silence it with
`HOOKFLOW_SUPPRESS_DEPRECATION_WARNING=1` while you migrate).

No new features or fixes land here — only in `@hookflow/node`. Migrate when
convenient.

## Publishing note (maintainers)

After publishing a new version of this shim, mark it deprecated on the
registry (`package.json`'s `deprecated` field is metadata only and is not
read by `npm publish`):

```bash
npm deprecate @webhook-platform/node "Renamed to @hookflow/node — see https://www.npmjs.com/package/@hookflow/node"
```

## License

MIT
