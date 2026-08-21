# webhook-platform (deprecated)

**This distribution has been renamed to [`hookflow-sdk`](../python).** Install
that instead:

```bash
pip uninstall webhook-platform
pip install hookflow-sdk
```

Your code does not need to change — the importable module was always called
`hookflow`, not `webhook_platform`:

```python
from hookflow import Hookflow, Event  # unchanged
```

## Why this package still exists

`webhook-platform` was already published to PyPI (v2.2.1) before the
product-wide rename to Hookflow was finished. PyPI does not allow renaming or
reusing a distribution name, so rather than abandon everyone who already
depends on `webhook-platform`, this distribution stays published as a pure
dependency shim: it has no code of its own and simply requires
`hookflow-sdk`, which provides the real `hookflow` module. `pip install
webhook-platform` keeps working; it just pulls in `hookflow-sdk` under the
hood.

No new features or fixes land here — only in `hookflow-sdk`. Migrate your
`requirements.txt` / `pyproject.toml` when convenient.

Note: the bare name `hookflow` was already registered on PyPI by an
unrelated project (a Git hooks manager), which is why the new distribution
is `hookflow-sdk` rather than `hookflow`.

## License

MIT
