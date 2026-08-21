#!/usr/bin/env bash
set -euo pipefail

# Hookflow CLI installer
# Usage: curl -fsSL https://raw.githubusercontent.com/vadymkykalo/webhook-platform/main/webhook-platform-cli/install.sh | bash
#
# Environment variables:
#   HOOKFLOW_VERSION       — version to install (default: latest release)
#   HOOKFLOW_INSTALL_DIR   — where to put the hookflow wrapper (default: ~/.local/bin)
#   HOOKFLOW_SKIP_JAVA     — set to 1 to skip auto-install of Java

VERSION="${HOOKFLOW_VERSION:-latest}"
INSTALL_DIR="${HOOKFLOW_INSTALL_DIR:-$HOME/.local/bin}"
JAR_DIR="$HOME/.local/lib/hookflow"
REPO="vadymkykalo/webhook-platform"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { echo -e "${CYAN}▸${RESET} $1"; }
ok()    { echo -e "${GREEN}✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}!${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1" >&2; exit 1; }

# ── Detect OS & package manager ──────────────────────────────
detect_os() {
    OS="$(uname -s)"
    ARCH="$(uname -m)"
    PKG_MGR=""

    case "$OS" in
        Linux)
            if command -v apt-get &>/dev/null; then
                PKG_MGR="apt"
            elif command -v dnf &>/dev/null; then
                PKG_MGR="dnf"
            elif command -v yum &>/dev/null; then
                PKG_MGR="yum"
            elif command -v pacman &>/dev/null; then
                PKG_MGR="pacman"
            fi
            ;;
        Darwin)
            if command -v brew &>/dev/null; then
                PKG_MGR="brew"
            fi
            ;;
    esac
    ok "Detected $OS ($ARCH), package manager: ${PKG_MGR:-none}"
}

# ── Ensure Java 17+ ─────────────────────────────────────────
ensure_java() {
    if command -v java &>/dev/null; then
        JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
        if [ "$JAVA_VER" -ge 17 ] 2>/dev/null; then
            ok "Java $JAVA_VER already installed"
            return
        fi
        warn "Found Java $JAVA_VER, but 17+ is required"
    fi

    if [ "${HOOKFLOW_SKIP_JAVA:-0}" = "1" ]; then
        fail "Java 17+ is required. Set HOOKFLOW_SKIP_JAVA=0 to auto-install."
    fi

    info "Installing Java 17 (headless runtime)..."

    case "$PKG_MGR" in
        apt)
            sudo apt-get update -qq
            sudo apt-get install -y -qq openjdk-17-jre-headless
            ;;
        dnf)
            sudo dnf install -y -q java-17-openjdk-headless
            ;;
        yum)
            sudo yum install -y -q java-17-openjdk-headless
            ;;
        pacman)
            sudo pacman -Sy --noconfirm jre17-openjdk-headless
            ;;
        brew)
            brew install --quiet openjdk@17
            # brew doesn't link by default
            sudo ln -sfn "$(brew --prefix openjdk@17)/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
            ;;
        *)
            fail "No supported package manager found. Install Java 17+ manually:
    Ubuntu/Debian:  sudo apt install openjdk-17-jre-headless
    Fedora/RHEL:    sudo dnf install java-17-openjdk-headless
    Arch:           sudo pacman -S jre17-openjdk-headless
    macOS:          brew install openjdk@17"
            ;;
    esac

    # Verify
    if ! command -v java &>/dev/null; then
        fail "Java installation succeeded but 'java' not found in PATH. Restart your terminal and try again."
    fi
    JAVA_VER=$(java -version 2>&1 | head -1 | cut -d'"' -f2 | cut -d'.' -f1)
    ok "Java $JAVA_VER installed"
}

# ── Resolve version ──────────────────────────────────────────
resolve_version() {
    if [ "$VERSION" = "latest" ]; then
        info "Resolving latest release..."
        VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
            | grep '"tag_name"' | head -1 | cut -d'"' -f4) || true
        if [ -z "$VERSION" ]; then
            VERSION="2.2.1"
            warn "No release found yet — using development build ($VERSION)"
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
        # SNAPSHOT — try local build first, then CI artifact
        for candidate in \
            "$(pwd)/webhook-platform-cli/target/webhook-platform-cli-${VERSION}.jar" \
            "$(pwd)/target/webhook-platform-cli-${VERSION}.jar" \
            "$(dirname "$0")/target/webhook-platform-cli-${VERSION}.jar"; do
            if [ -f "$candidate" ]; then
                cp "$candidate" "$JAR_FILE"
                ok "Copied local build from $candidate"
                return
            fi
        done

        # Try CI artifact download
        ARTIFACT_URL="https://github.com/$REPO/releases/download/nightly/webhook-platform-cli-${VERSION}.jar"
        info "Trying nightly build: $ARTIFACT_URL"
        if curl -fsSL -o "$JAR_FILE" "$ARTIFACT_URL" 2>/dev/null; then
            ok "Downloaded nightly build"
            return
        fi

        fail "No pre-built JAR available yet. Build from source:
    git clone https://github.com/$REPO.git
    cd webhook-platform
    mvn clean package -pl webhook-platform-cli -am -DskipTests
    ./webhook-platform-cli/install.sh"
    else
        DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/hookflow-cli.jar"
        info "Downloading hookflow-cli $VERSION..."
        if ! curl -fsSL -o "$JAR_FILE" "$DOWNLOAD_URL"; then
            fail "Download failed. Check: https://github.com/$REPO/releases"
        fi
        ok "Downloaded to $JAR_FILE ($(du -h "$JAR_FILE" | cut -f1))"
    fi
}

# ── Create wrapper script ────────────────────────────────────
create_wrapper() {
    mkdir -p "$INSTALL_DIR"
    WRAPPER="$INSTALL_DIR/hookflow"

    cat > "$WRAPPER" << 'WRAPPER_EOF'
#!/usr/bin/env bash
JAR_DIR="$HOME/.local/lib/hookflow"
exec java -jar "$JAR_DIR/hookflow-cli.jar" "$@"
WRAPPER_EOF

    chmod +x "$WRAPPER"
    ok "Wrapper installed at $WRAPPER"
}

# ── Ensure PATH ──────────────────────────────────────────────
ensure_path() {
    if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
        return
    fi

    # Try to add to shell profile automatically
    SHELL_NAME="$(basename "$SHELL" 2>/dev/null || echo bash)"
    case "$SHELL_NAME" in
        zsh)  PROFILE="$HOME/.zshrc" ;;
        fish) PROFILE="$HOME/.config/fish/config.fish" ;;
        *)    PROFILE="$HOME/.bashrc" ;;
    esac

    if [ -f "$PROFILE" ]; then
        if ! grep -q "HOOKFLOW_INSTALL_DIR\|\.local/bin" "$PROFILE" 2>/dev/null; then
            echo "" >> "$PROFILE"
            echo "# Hookflow CLI" >> "$PROFILE"
            echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$PROFILE"
            ok "Added $INSTALL_DIR to PATH in $PROFILE"
            warn "Run: source $PROFILE  (or restart terminal)"
            return
        fi
    fi

    echo ""
    echo -e "${BOLD}Add to your shell profile:${RESET}"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
}

# ── Main ─────────────────────────────────────────────────────
main() {
    echo ""
    echo -e "${BOLD}${CYAN}  ╔═══════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}  ║   Hookflow CLI Installer          ║${RESET}"
    echo -e "${BOLD}${CYAN}  ╚═══════════════════════════════════╝${RESET}"
    echo ""

    detect_os
    ensure_java
    resolve_version
    download_jar
    create_wrapper
    ensure_path

    echo ""
    echo -e "${GREEN}${BOLD}  Installation complete!${RESET}"
    echo ""
    echo "  Quick start:"
    echo "    hookflow login              # Authenticate with your server"
    echo "    hookflow listen 3000        # Start tunnel → localhost:3000"
    echo "    hookflow tunnels status     # Check active tunnels"
    echo "    hookflow config show        # View configuration"
    echo ""
    echo "  Config: ~/.config/hookflow/config.json"
    echo "  Docs:   https://github.com/$REPO#cli-commands"
    echo ""
}

main "$@"
