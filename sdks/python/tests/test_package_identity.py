"""Guards the published identity of this SDK.

The PyPI *distribution* is ``webhook-platform``; the importable module is
``hookflow``. The two names differ on purpose, so this fails loudly if either
the installed distribution metadata or the import surface ever drifts.
"""

import importlib.metadata

from hookflow import Hookflow


def test_distribution_is_published_as_webhook_platform():
    dist = importlib.metadata.distribution("webhook-platform")
    assert dist.metadata["Name"] == "webhook-platform"


def test_smoke_import_of_hookflow_module_constructs_a_client():
    client = Hookflow(api_key="wh_test_key")
    assert isinstance(client, Hookflow)
    assert client.events is not None
