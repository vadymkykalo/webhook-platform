import pytest

from .support import bootstrap_contract_project, is_api_reachable, ContractContext


@pytest.fixture(scope="session")
def api_available() -> bool:
    return is_api_reachable()


@pytest.fixture(scope="session")
def contract_ctx(api_available: bool) -> ContractContext:
    if not api_available:
        pytest.skip(
            "API not reachable at CONTRACT_API_BASE_URL (default http://localhost:8080) — "
            "run `make up && make wait-healthy` first. See tests/contract/README.md."
        )
    return bootstrap_contract_project("py-sdk-client")
