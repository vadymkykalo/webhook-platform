# P1-18 — Fix and harden install.sh

- **Status:** TODO
- **Priority:** P1 — it is the headline install method, piped to bash
- **Branch:** `feature/P1-18-install-sh-hardening`
- **Depends on:** P1-15 (checksums are published by the release workflow)
- **Area:** `webhook-platform-cli/install.sh`, `.github/workflows/release-cli.yml`

## Context

`README.md:311` tells users to `curl … | bash`. The script is decent on the happy
path — `set -euo pipefail`, package-manager detection, clear failures, env-var
overrides, no `rm -rf` — but it has one plain bug and several sharp edges.

## Steps

- [ ] **Bug: `HOOKFLOW_SKIP_JAVA` is inverted.** Line 10 documents
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
- [ ] **PATH setup can silently no-op and still report success.** The guard
      `if ! grep -q "HOOKFLOW_INSTALL_DIR\|\.local/bin" "$PROFILE"` falls through
      both branches for any user whose rc file already mentions `.local/bin` —
      extremely common (pipx, poetry, cargo, pip --user all add it). The script
      then prints "Installation complete!" while `hookflow` may not be on PATH.
      Also, it never creates `$PROFILE` if absent. End the script with an actual
      `command -v hookflow` check and only then claim success.
- [ ] **No integrity verification.** The JAR is downloaded from a GitHub release
      and `exec java -jar`'d forever, with no `sha256sum` and no signature.
      Publish `SHA256SUMS` from `release-cli.yml` and verify it in the script.
      For a curl-pipe installer this is table stakes.
- [ ] **Silent `sudo`.** The script runs `sudo apt-get install …` and, on macOS,
      `sudo ln -sfn … /Library/Java/JavaVirtualMachines/…`. A remote script
      escalating to root without prompting is precisely what makes people
      distrust curl-pipe installers. Prompt, or make it `--with-java` opt-in.
- [ ] **`fish` is broken.** It selects `~/.config/fish/config.fish` then appends
      bash syntax (`export PATH="$INSTALL_DIR:$PATH"`), which errors on every
      shell start. Emit `fish_add_path` instead.
- [ ] Minor, worth doing while open: the SNAPSHOT branch probes
      `$(dirname "$0")/target/...`, meaningless under `curl | bash` where `$0` is
      `bash`; Java version parsing breaks on JVMs that do not quote the version;
      the generated wrapper does not check the JAR exists or honour `JAVA_OPTS`;
      there is no uninstall path.

## Tests to write

`install.sh` is **never tested in CI** today. Add a matrix job:

- [ ] `.github/workflows/` job on `ubuntu-latest` and `macos-latest` that runs the
      script end to end and asserts `hookflow --version` works afterwards.
- [ ] Cases worth covering: clean machine with no Java; machine with Java 17
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

- [ ] `HOOKFLOW_SKIP_JAVA` behaves as documented.
- [ ] Success is only reported when `hookflow` is genuinely runnable.
- [ ] Checksum published and verified.
- [ ] `sudo` requires consent; fish works.
- [ ] CI matrix job runs the installer on Linux and macOS.

## Progress log
