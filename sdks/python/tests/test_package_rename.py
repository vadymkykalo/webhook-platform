"""Regression test for the package rename (PyPI dist `webhook-platform` -> `hookflow-sdk`).

The importable module has always been named `hookflow`; only the PyPI
*distribution* name changes here. This must fail loudly if either the
installed distribution metadata or the import surface ever drifts.
"""

import importlib.metadata

from hookflow import Hookflow


def test_distribution_is_published_as_hookflow_sdk():
    dist = importlib.metadata.distribution("hookflow-sdk")
    assert dist.metadata["Name"] == "hookflow-sdk"


def test_smoke_import_by_new_package_constructs_a_client():
    client = Hookflow(api_key="wh_test_key")
    assert isinstance(client, Hookflow)
    assert client.events is not None
