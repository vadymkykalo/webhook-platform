// @webhook-platform/node is deprecated — renamed to @hookflow/node.
// This package now only re-exports @hookflow/node so existing installs keep
// working without a hard break. Please switch to `@hookflow/node` directly.
if (!process.env.HOOKFLOW_SUPPRESS_DEPRECATION_WARNING) {
  // eslint-disable-next-line no-console
  console.warn(
    '[@webhook-platform/node] This package has been renamed to @hookflow/node. ' +
      'Install @hookflow/node and update your imports — @webhook-platform/node ' +
      'only re-exports it and will not receive new features. ' +
      'Set HOOKFLOW_SUPPRESS_DEPRECATION_WARNING=1 to silence this notice.'
  );
}

module.exports = require('@hookflow/node');
