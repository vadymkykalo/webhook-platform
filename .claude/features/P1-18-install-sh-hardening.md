# P1-18 — Fix and harden install.sh

- **Status:** DONE
- **Priority:** P1 — it is the headline install method, piped to bash
- **Branch:** `feature/P1-18-install-sh-hardening`
- **Depends on:** P1-15 (checksums are published by the release workflow)
- **Area:** `webhook-platform-cli/install.sh`, `.github/workflows/release-cli.yml`

## Context

`README.md:311` tells users to `curl … | bash`. The script is decent on the happy
path — `set -euo pipefail`, package-manager detection, clear failures, env-var
overrides, no `rm -rf` — but it has one plain bug and several sharp edges.

## Steps

- [x] **Bug: `HOOKFLOW_SKIP_JAVA` is inverted.** Line 10 documents
      "set to 1 to skip auto-install of Java". Lines 67-68 do the opposite:
      ```bash
      if [ "${HOOKFLOW_SKIP_JAVA:-0}" = "1" ]; then
          fail "Java 17+ is required. Set HOOKFLOW_SKIP_JAVA=0 to auto-install."
      fi
      ```
      A user managing their own JVM (SDKMAN, where `java` may resolve only after
      profile load) sets the flag as documented and gets an aborted install
      telling them to unset the flag they deliberately set. Make `=1` skip the
      install and continue.
- [x] **PATH setup can silently no-op and still report success.** The guard
      `if ! grep -q "HOOKFLOW_INSTALL_DIR\|\.local/bin" "$PROFILE"` falls through
      both branches for any user whose rc file already mentions `.local/bin` —
      extremely common (pipx, poetry, cargo, pip --user all add it). The script
      then prints "Installation complete!" while `hookflow` may not be on PATH.
      Also, it never creates `$PROFILE` if absent. End the script with an actual
      `command -v hookflow` check and only then claim success.
- [x] **No integrity verification.** The JAR is downloaded from a GitHub release
      and `exec java -jar`'d forever, with no `sha256sum` and no signature.
      Publish `SHA256SUMS` from `release-cli.yml` and verify it in the script.
      For a curl-pipe installer this is table stakes.
- [x] **Silent `sudo`.** The script runs `sudo apt-get install …` and, on macOS,
      `sudo ln -sfn … /Library/Java/JavaVirtualMachines/…`. A remote script
      escalating to root without prompting is precisely what makes people
      distrust curl-pipe installers. Prompt, or make it `--with-java` opt-in.
- [x] **`fish` is broken.** It selects `~/.config/fish/config.fish` then appends
      bash syntax (`export PATH="$INSTALL_DIR:$PATH"`), which errors on every
      shell start. Emit `fish_add_path` instead.
- [x] Minor, worth doing while open: the SNAPSHOT branch probes
      `$(dirname "$0")/target/...`, meaningless under `curl | bash` where `$0` is
      `bash`; Java version parsing breaks on JVMs that do not quote the version;
      the generated wrapper does not check the JAR exists or honour `JAVA_OPTS`;
      there is no uninstall path.

## Tests to write

`install.sh` is **never tested in CI** today. Add a matrix job:

- [x] `.github/workflows/` job on `ubuntu-latest` and `macos-latest` that runs the
      script end to end and asserts `hookflow --version` works afterwards.
- [x] Cases worth covering: clean machine with no Java; machine with Java 17
      already present; `HOOKFLOW_SKIP_JAVA=1` with Java present (must succeed);
      rc file that already mentions `.local/bin` (the silent-failure case);
      tampered checksum (must refuse).

## Verification

```bash
shellcheck webhook-platform-cli/install.sh
docker run --rm -it ubuntu:22.04 bash -c \
  'apt-get update -qq && apt-get install -y -qq curl && curl -fsSL <raw-url> | bash && hookflow --version'
```

## Definition of done

- [x] `HOOKFLOW_SKIP_JAVA` behaves as documented.
- [x] Success is only reported when `hookflow` is genuinely runnable.
- [x] Checksum published and verified.
- [x] `sudo` requires consent; fish works.
- [x] CI matrix job runs the installer on Linux and macOS.

## Progress log

**What changed**

- `webhook-platform-cli/install.sh` — rewritten with:
  - `HOOKFLOW_SKIP_JAVA=1` now genuinely skips Java auto-install and continues
    (was: `fail`s with a message telling the user to unset the very flag they
    set, per the doc).
  - `ensure_path()` no longer uses the broad `grep -q "...\.local/bin"` guard
    (matched any unrelated `.local/bin` mention, e.g. pipx/poetry/cargo lines,
    and silently no-op'd). It now checks for the *exact* export line for the
    configured `INSTALL_DIR`, creates `$PROFILE` (and its parent dir) if
    absent, and `main()` only prints "Installation complete!" after a real
    `command -v hookflow` check on the *current* `$PATH` — otherwise it prints
    the exact `export PATH=...` command needed and does not claim success.
  - `verify_checksum()` downloads `SHA256SUMS` for the release tag and refuses
    to install (deleting the JAR) on any mismatch, missing sums file, or
    missing `sha256sum`/`shasum`. `release-cli.yml` now generates and
    publishes `SHA256SUMS` alongside `hookflow-cli.jar`.
  - Java auto-install now requires either `--with-java` or
    `HOOKFLOW_WITH_JAVA=1`; without it, a missing Java 17+ produces
    instructions instead of a silent `sudo apt-get install ...`.
  - fish users get `fish_add_path $INSTALL_DIR` instead of a bash `export`
    line appended to `config.fish`.
  - Added `--uninstall` (removes the wrapper + JAR dir, leaves config/rc
    changes in place) and `-h`/`--help`.
  - `detect_java_major_version()` parses both the standard quoted
    `version "17.0.9"` form and unquoted output, plus the old `1.8.0_x`
    scheme — replaces the old `cut -d'"' -f2` that silently produced garbage
    on unquoted output.
  - Dropped the `$(dirname "$0")/target/...` SNAPSHOT-jar probe (meaningless
    under `curl | bash`, where `$0` is `bash`); kept the two `$(pwd)`-based
    probes for the `./install.sh` local-repo case.
  - The generated wrapper now checks the JAR exists (with a re-run hint if
    not) and honours `JAVA_OPTS`.
  - Added `HOOKFLOW_GITHUB_BASE_URL` / `HOOKFLOW_GITHUB_API_BASE_URL` — test
    hooks only (undocumented in the user-facing header), so CI can point the
    installer at a local fixture instead of real GitHub releases.
- `.github/workflows/release-cli.yml` — generates `SHA256SUMS` next to
  `hookflow-cli.jar` and publishes it as a release asset; release notes now
  include a `sha256sum -c SHA256SUMS` verify step.
- `.github/workflows/install-sh-test.yml` (new) — `install-sh` job matrixed
  on `ubuntu-latest`/`macos-latest` runs the real script end to end against a
  fixture release built from the JAR the job compiles, then asserts
  `hookflow --version`; `install-sh-linux-cases` job (Docker, ubuntu-latest
  only — macOS-hosted runners can't run Docker) covers: `HOOKFLOW_SKIP_JAVA=1`
  with no Java present, clean machine + `--with-java`, rc file already
  mentioning `.local/bin`, and tampered-checksum refusal.
- `README.md` CLI-install snippet updated: no longer claims Java is
  auto-installed unconditionally (now opt-in via `--with-java`), added an
  uninstall one-liner.

**Verification — shellcheck (verbatim command from the task)**

```
$ shellcheck webhook-platform-cli/install.sh
$ echo $?
0
```
No output, no findings, from shellcheck 0.11.0.

**Verification — actionlint on both touched workflow files**

```
$ actionlint .github/workflows/install-sh-test.yml
$ actionlint .github/workflows/release-cli.yml
```
Both exit 0, no findings (no `actionlint`/`gh` in this sandbox by default;
downloaded the static release binary to verify).

**Verification — real Docker end-to-end (this sandbox has no `gh` CLI/token
and cannot push a branch to trigger a real release build, so the task's
literal `curl -fsSL <raw-url> | bash` one-liner against a real tag isn't
executable here — noting that explicitly rather than fabricating output).
Instead, built the actual CLI JAR from `Main.java` targeting `--release 17`,
served it from a fixture tree shaped like a real GitHub release
(`vadymkykalo/webhook-platform/releases/download/<tag>/{hookflow-cli.jar,SHA256SUMS}`)
via `HOOKFLOW_GITHUB_BASE_URL`, and ran the actual `install.sh` inside
disposable `ubuntu:22.04` containers — this exercises the real script, real
`curl` downloads, real `sudo`/`apt-get`, real checksum verification, not a
mock:**

```
=== Scenario 1: clean machine, no Java, --with-java ===
PASS: clean machine, no java, --with-java (exit 0 as expected)
=== Scenario 2: Java 17 already present, no flags ===
PASS: java 17 present, no flags (exit 0 as expected)
=== Scenario 3: HOOKFLOW_SKIP_JAVA=1 with Java present must succeed ===
PASS: HOOKFLOW_SKIP_JAVA=1 with java present (exit 0 as expected)
=== Scenario 3b (bug reproduction): HOOKFLOW_SKIP_JAVA=1 with NO java on PATH must NOT abort ===
PASS: HOOKFLOW_SKIP_JAVA=1, no java, must skip+continue (not abort) (exit 0 as expected)
=== Scenario 4: rc file already mentions .local/bin (silent-failure case) ===
PASS: rc already mentions .local/bin, PATH still gets fixed (exit 0 as expected)
=== Scenario 5: tampered checksum must refuse ===
PASS: tampered checksum refused, bad jar removed (exit 0 as expected)
=== Scenario 6: --uninstall removes wrapper and jar ===
PASS: --uninstall removes wrapper+jar (exit 0 as expected)

====================================
PASS=7 FAIL=0
====================================
```

Separately verified fish support end to end (Ubuntu 22.04's bundled fish
3.3.1, `HOOKFLOW_SKIP_JAVA=1` then Java installed for the version check): the
installer wrote `fish_add_path /home/tester/.local/bin` into
`~/.config/fish/config.fish`, `fish -c "echo ..."` loaded that config with no
error and the resulting `$PATH` included the install dir, and
`fish -c "hookflow --version"` printed the fixture CLI's version string.
Caveat: Ubuntu 22.04's fish ships a bash-compatibility `export` shim
(`/usr/share/fish/functions/export.fish`), so the *old* script's broken
`export PATH=...` line did not actually error in this specific fish build —
I could not locally reproduce a hard failure for that exact defect, but the
old approach still relies on non-standard, non-portable behavior, and
`fish_add_path` is the correct native mechanism regardless.

**Bug reproduction (protocol step: prove the regression test would have
caught the original defect)** — ran the pre-fix `install.sh` (from `develop`)
with `HOOKFLOW_SKIP_JAVA=1` and no `java` on `PATH`:

```
✗ Java 17+ is required. Set HOOKFLOW_SKIP_JAVA=0 to auto-install.
OLD script exit code: 1
```

Confirms the exact inversion bug described in the task; the fixed script's
Scenario 3b above (same setup) exits 0 and skips Java instead of aborting.

**Incidental real-world confirmation of fail-closed checksum behavior**: the
real latest tagged release on this repo (`v2.2.1`) predates this change and
has no `SHA256SUMS` asset yet. Running the fixed installer against it
(`HOOKFLOW_VERSION=v2.2.1`, no base-URL override) correctly refuses:
`✗ Could not download SHA256SUMS for v2.2.1 (...) — refusing to install an
unverified JAR.` This is expected and will resolve itself the next time
`release-cli.yml` runs on a new tag (now that it publishes `SHA256SUMS`).

**Deliberately left out**: did not add a `.zip`/signature-based verification
scheme beyond `SHA256SUMS` (matches what the task asked for — "table
stakes" — GPG signing would be a separate, bigger change). Did not attempt
to make the `install-sh` matrix job's macOS leg exercise the Docker-only
edge cases (clean-no-Java, rc-already-has-`.local/bin`, tampered-checksum) —
GitHub-hosted `macos-latest` runners cannot run Docker containers, so those
four cases are Linux-only by necessity; the macOS leg still gets full
real-script coverage via the main `install-sh` job (Java-present +
`HOOKFLOW_SKIP_JAVA=1` path).
