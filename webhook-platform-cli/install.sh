#!/usr/bin/env bash
set -euo pipefail

# Hookflow CLI installer
# Usage: curl -fsSL https://hookflow.dev/install.sh | bash
#    or: curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/webhook-platform-cli/install.sh | bash

VERSION="${HOOKFLOW_VERSION:-latest}"
INSTALL_DIR="${HOOKFLOW_INSTALL_DIR:-$HOME/.local/bin}"
JAR_DIR="${HOOKFLOW_JAR_DIR:-$HOME/.local/lib/hookflow}"
REPO="vadymkykalo/webhook-platform"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${CYAN}▸${RESET} $1"; }
ok()    { echo -e "${GREEN}✓${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1" >&2; exit 1; }

# ── Check Java ───────────────────────────────────────────────
check_java() {
    if ! command -v java &>/dev/null; then
        fail "Java 17+ is required but not found. Install it first:
    Ubuntu/Debian: sudo apt install openjdk-17-jre-headless
    macOS:         brew install openjdk@17
    Fedora:        sudo dnf install java-17-openjdk"
    fi

    JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$JAVA_VER" -lt 17 ] 2>/dev/null; then
        fail "Java 17+ required, found Java $JAVA_VER"
    fi
    ok "Java $JAVA_VER detected"
}

# ── Resolve version ──────────────────────────────────────────
resolve_version() {
    if [ "$VERSION" = "latest" ]; then
        info "Resolving latest release..."
        VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
            | grep '"tag_name"' | head -1 | cut -d'"' -f4)
        if [ -z "$VERSION" ]; then
            # Fallback: use SNAPSHOT build from main branch
            VERSION="1.0.0-SNAPSHOT"
            info "No release found, using development build ($VERSION)"
            return
        fi
    fi
    ok "Version: $VERSION"
}

# ── Download JAR ─────────────────────────────────────────────
download_jar() {
    mkdir -p "$JAR_DIR"
    JAR_FILE="$JAR_DIR/hookflow-cli.jar"

    if echo "$VERSION" | grep -q "SNAPSHOT"; then
        # For SNAPSHOT — build locally or download from CI artifacts
        info "SNAPSHOT version — checking for local build..."
        LOCAL_JAR="$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/target/webhook-platform-cli-${VERSION}.jar"
        if [ -f "$LOCAL_JAR" ]; then
            cp "$LOCAL_JAR" "$JAR_FILE"
            ok "Copied local build"
            return
        fi

        # Try to find it in standard Maven build output
        SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
        for dir in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$(pwd)" "$(pwd)/webhook-platform-cli"; do
            candidate="$dir/target/webhook-platform-cli-${VERSION}.jar"
            if [ -f "$candidate" ]; then
                cp "$candidate" "$JAR_FILE"
                ok "Copied from $candidate"
                return
            fi
        done

        fail "SNAPSHOT build not found. Build first:
    cd webhook-platform && mvn clean package -pl webhook-platform-cli -am -DskipTests
    Then re-run this script."
    else
        DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/webhook-platform-cli-${VERSION#v}.jar"
        info "Downloading $DOWNLOAD_URL..."
        if ! curl -fsSL -o "$JAR_FILE" "$DOWNLOAD_URL"; then
            fail "Download failed. Check version '$VERSION' exists at:
    https://github.com/$REPO/releases"
        fi
        ok "Downloaded to $JAR_FILE"
    fi
}

# ── Create wrapper script ────────────────────────────────────
create_wrapper() {
    mkdir -p "$INSTALL_DIR"
    WRAPPER="$INSTALL_DIR/hookflow"

    cat > "$WRAPPER" << 'WRAPPER_EOF'
#!/usr/bin/env bash
JAR_DIR="${HOOKFLOW_JAR_DIR:-$HOME/.local/lib/hookflow}"
exec java -jar "$JAR_DIR/hookflow-cli.jar" "$@"
WRAPPER_EOF

    chmod +x "$WRAPPER"
    ok "Installed to $WRAPPER"
}

# ── Check PATH ───────────────────────────────────────────────
check_path() {
    if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
        echo ""
        echo -e "${BOLD}Add to your shell profile:${RESET}"
        echo ""
        echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
        echo ""
        echo "Then restart your terminal or run: source ~/.bashrc"
    fi
}

# ── Main ─────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${BOLD}${CYAN}Hookflow CLI Installer${RESET}"
    echo "─────────────────────────────────────"
    echo ""

    check_java
    resolve_version
    download_jar
    create_wrapper
    check_path

    echo ""
    echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
    echo ""
    echo "  Get started:"
    echo "    hookflow login              # Authenticate"
    echo "    hookflow listen 3000        # Start tunnel"
    echo "    hookflow config show        # View config"
    echo ""
    echo "  Docs: https://github.com/$REPO#cli-commands"
    echo ""
}

main "$@"
