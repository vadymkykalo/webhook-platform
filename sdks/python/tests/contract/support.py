"""Shared bootstrap for the python SDK's contract suite.

Same pattern as sdks/node/tests/contract/support.ts and
load/lib/setup.js: the Hookflow client is API-key scoped only (no
register/login/create-project surface — see hookflow/client.py), so
bootstrapping a throwaway tenant needs a couple of raw `requests` calls
against the JWT-authenticated endpoints before the SDK proper takes over.
"""
import os
import time
import uuid
from dataclasses import dataclass
from typing import Optional

import requests

BASE_URL = os.environ.get("CONTRACT_API_BASE_URL", "http://localhost:8080")
PASSWORD = "ContractTest!2026x"  # meets AuthController's complexity policy


@dataclass
class ContractContext:
    project_id: str
    api_key: str
    access_token: str


def is_api_reachable() -> bool:
    # Deliberately does NOT hit /actuator/health/liveness: under `make up`
    # (docker-compose.yml), actuator is served on its own MANAGEMENT_PORT
    # (8082), never published to the host. /v3/api-docs is permitAll on the
    # main port (SecurityConfig.java) and always present (springdoc is on
    # the classpath — OpenApiConfig.java).
    try:
        res = requests.get(f"{BASE_URL}/v3/api-docs", timeout=3)
        return res.ok
    except requests.RequestException:
        return False


def bootstrap_contract_project(prefix: str) -> ContractContext:
    suffix = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"

    register_res = requests.post(
        f"{BASE_URL}/api/v1/auth/register",
        json={
            "email": f"{prefix}-{suffix}@python-contract-test.invalid",
            "password": PASSWORD,
            "fullName": f"Python Contract Test {prefix}",
            "organizationName": f"py-contract-{suffix}"[:100],
        },
        timeout=10,
    )
    register_res.raise_for_status()
    auth = register_res.json()
    access_token = auth["accessToken"]
    auth_headers = {"Authorization": f"Bearer {access_token}"}

    project_res = requests.post(
        f"{BASE_URL}/api/v1/projects",
        json={"name": f"py-contract-{suffix}"[:100]},
        headers=auth_headers,
        timeout=10,
    )
    project_res.raise_for_status()
    project = project_res.json()

    key_res = requests.post(
        f"{BASE_URL}/api/v1/projects/{project['id']}/api-keys",
        json={"name": f"py-contract-key-{suffix}", "scope": "READ_WRITE"},
        headers=auth_headers,
        timeout=10,
    )
    key_res.raise_for_status()
    api_key = key_res.json()["key"]

    return ContractContext(project_id=project["id"], api_key=api_key, access_token=access_token)
