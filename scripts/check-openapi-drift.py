#!/usr/bin/env python3
"""Fails when the committed openapi.yaml disagrees *semantically* with the spec
the running API serves.

The committed spec is what evaluators and docs.hookflow.dev's Redoc renderer
read, so it must not silently drift from the live one. It used to be checked
with `diff -u`, which compared 246 KB of generated YAML byte for byte — and
therefore went red on things that are not API changes at all:

  * the serializer's quoting style flipping ('...' vs "...") across a
    springdoc/snakeyaml upgrade, worth ~500 diff lines on its own;
  * key ordering, which YAML does not consider meaningful.

Both produced a red build that a regenerate-and-commit "fixed" without any API
having changed, which trains people to regenerate on red rather than read the
diff. Parsing both sides and comparing the resulting structures keeps the check
honest: it reports added, removed, and changed paths, operations, and schemas,
and stays quiet about formatting.

Operation ids are compared like any other value — they are stable by
construction (see OpenApiConfig#deterministicOperationIds and
OpenApiOperationIdTest), so a change in one is a real API change.

Usage:
  scripts/check-openapi-drift.py <committed.yaml> <live.yaml>
"""

import sys

try:
    import yaml
except ImportError:
    sys.exit("PyYAML is required: pip install pyyaml")

MAX_REPORTED = 60


def walk(committed, live, path, out):
    if type(committed) is not type(live):
        out.append(f"  CHANGED  {path}: type {type(committed).__name__} -> {type(live).__name__}")
        return
    if isinstance(committed, dict):
        for key in sorted(set(committed) | set(live), key=str):
            child = f"{path}.{key}" if path else str(key)
            if key not in committed:
                out.append(f"  ADDED    {child}")
            elif key not in live:
                out.append(f"  REMOVED  {child}")
            else:
                walk(committed[key], live[key], child, out)
    elif isinstance(committed, list):
        if committed != live:
            out.append(f"  CHANGED  {path}: list of {len(committed)} -> {len(live)}")
    elif committed != live:
        out.append(f"  CHANGED  {path}: {committed!r} -> {live!r}")


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    committed_file, live_file = sys.argv[1], sys.argv[2]

    with open(committed_file) as handle:
        committed = yaml.safe_load(handle)
    with open(live_file) as handle:
        live = yaml.safe_load(handle)

    differences = []
    walk(committed, live, "", differences)

    if not differences:
        print(f"openapi.yaml matches the live spec ({committed_file} == {live_file}, semantically).")
        return 0

    print(f"::error::openapi.yaml has drifted from the live spec "
          f"({len(differences)} semantic differences).")
    print("--- committed openapi.yaml vs live /v3/api-docs.yaml ---")
    for line in differences[:MAX_REPORTED]:
        print(line)
    if len(differences) > MAX_REPORTED:
        print(f"  ... and {len(differences) - MAX_REPORTED} more")
    print("")
    print("Regenerate it against a local SWAGGER_ENABLED=true stack and commit the result:")
    print("  curl -s http://localhost:8080/v3/api-docs.yaml -o openapi.yaml")
    return 1


if __name__ == "__main__":
    sys.exit(main())
