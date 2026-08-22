#!/usr/bin/env bash
set -euo pipefail

# Fails when a test class that needs Docker is named so that CI routes it to the
# unit-test job.
#
# The split between the two backend jobs in .github/workflows/ci.yml is done
# purely by class-name suffix: `Backend Integration Tests` runs
# *IntegrationTest, *IT, *RepositoryTest, *ConcurrencyTest, *RbacTest and
# *IsolationTest, and `Backend Tests` runs everything else with those excluded.
# Nothing checks that the name matches what the test actually needs.
#
# So a Testcontainers-backed test called plain FooTest passes locally, where
# Docker is running, and fails in the unit job, where it is not — and the
# failure looks like a broken test rather than a misnamed one. This catches it
# at the name.
#
# Usage: scripts/check-test-routing.sh
# CI runs it in the `backend-test` job before the tests themselves.

cd "$(git rev-parse --show-toplevel)"

INTEGRATION_SUFFIXES='(IntegrationTest|IT|RepositoryTest|ConcurrencyTest|RbacTest|IsolationTest)\.java$'

# Markers that mean "this test boots a container or a Spring context with one"
NEEDS_DOCKER='@Testcontainers|@SpringBootTest|AbstractIntegrationTest|GenericContainer|PostgreSQLContainer|KafkaContainer'

misrouted=()
while IFS= read -r file; do
    if [[ "$file" =~ $INTEGRATION_SUFFIXES ]]; then
        continue
    fi
    if grep -qE "$NEEDS_DOCKER" "$file"; then
        misrouted+=("$file")
    fi
done < <(find . -path ./node_modules -prune -o -path '*/src/test/java/*' -name '*Test.java' -print)

if [ ${#misrouted[@]} -gt 0 ]; then
    echo "::error::Test classes need Docker but are named to run in the unit-test job."
    echo ""
    echo "CI routes backend tests by class-name suffix alone. These files use"
    echo "Testcontainers or @SpringBootTest, so they belong in the integration job,"
    echo "but their names put them in the unit job — where there is no Docker:"
    echo ""
    for f in "${misrouted[@]}"; do
        echo "  $f"
    done
    echo ""
    echo "Rename each to end in one of: IntegrationTest, IT, RepositoryTest,"
    echo "ConcurrencyTest, RbacTest, IsolationTest."
    exit 1
fi

echo "Test routing OK: no Docker-dependent test is named into the unit-test job."
