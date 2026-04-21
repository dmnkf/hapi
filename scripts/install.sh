#!/usr/bin/env bash
#
# Install script for hapi (dmnkf fork)
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dmnkf/hapi/main/scripts/install.sh | bash
#
# Options (environment variables):
#   HAPI_VERSION   Specific version to install (default: latest)
#   HAPI_INSTALL_DIR  Install directory (default: $HOME/.local/bin)
#   HAPI_SYSTEM    Set to 1 to install to /usr/local/bin (requires sudo)
#
# Examples:
#   curl -fsSL .../install.sh | bash
#   curl -fsSL .../install.sh | HAPI_VERSION=v0.17.0-dmnkf.1 bash
#   curl -fsSL .../install.sh | HAPI_SYSTEM=1 bash

set -euo pipefail

REPO="dmnkf/hapi"
BIN_NAME="hapi"
DEFAULT_USER_DIR="$HOME/.local/bin"
SYSTEM_DIR="/usr/local/bin"

msg() { printf '%s\n' "$*" >&2; }
err() { printf 'error: %s\n' "$*" >&2; exit 1; }

need_cmd() {
    if ! command -v "$1" >/dev/null 2>&1; then
        err "required command not found: $1"
    fi
}

detect_os() {
    local os
    os="$(uname -s)"
    case "$os" in
        Linux) echo "linux" ;;
        Darwin) echo "darwin" ;;
        *) err "unsupported OS: $os (supported: Linux, Darwin)" ;;
    esac
}

detect_arch() {
    local arch
    arch="$(uname -m)"
    case "$arch" in
        x86_64 | amd64) echo "x64" ;;
        aarch64 | arm64) echo "arm64" ;;
        *) err "unsupported architecture: $arch (supported: x86_64, aarch64)" ;;
    esac
}

resolve_version() {
    local version="${HAPI_VERSION:-}"
    if [ -n "$version" ]; then
        # Ensure leading v
        case "$version" in
            v*) printf '%s' "$version" ;;
            *) printf 'v%s' "$version" ;;
        esac
        return
    fi

    # Fetch latest release tag via GitHub API
    local api_url="https://api.github.com/repos/${REPO}/releases/latest"
    local tag
    tag="$(curl -fsSL "$api_url" | grep --color=never '"tag_name":' | head -1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
    if [ -z "$tag" ]; then
        err "could not determine latest version from GitHub API. Set HAPI_VERSION explicitly."
    fi
    printf '%s' "$tag"
}

resolve_install_dir() {
    if [ "${HAPI_SYSTEM:-0}" = "1" ]; then
        printf '%s' "$SYSTEM_DIR"
        return
    fi
    printf '%s' "${HAPI_INSTALL_DIR:-$DEFAULT_USER_DIR}"
}

download_and_install() {
    local os="$1"
    local arch="$2"
    local version="$3"
    local install_dir="$4"

    local asset="hapi-${os}-${arch}.tar.gz"
    local url="https://github.com/${REPO}/releases/download/${version}/${asset}"
    local tmp_dir
    tmp_dir="$(mktemp -d)"
    # shellcheck disable=SC2064
    trap "rm -rf '$tmp_dir'" EXIT

    msg ">>> Downloading $asset from $version"
    if ! curl -fLo "$tmp_dir/$asset" "$url"; then
        err "download failed from $url"
    fi

    msg ">>> Verifying archive"
    if ! tar -tzf "$tmp_dir/$asset" >/dev/null 2>&1; then
        err "downloaded archive is not a valid tar.gz"
    fi

    msg ">>> Extracting"
    tar -xzf "$tmp_dir/$asset" -C "$tmp_dir"

    if [ ! -f "$tmp_dir/$BIN_NAME" ]; then
        err "expected binary '$BIN_NAME' not found in archive"
    fi

    chmod +x "$tmp_dir/$BIN_NAME"

    msg ">>> Installing to $install_dir"
    if [ "${HAPI_SYSTEM:-0}" = "1" ]; then
        if [ "$(id -u)" -ne 0 ]; then
            if command -v sudo >/dev/null 2>&1; then
                sudo mkdir -p "$install_dir"
                sudo mv "$tmp_dir/$BIN_NAME" "$install_dir/$BIN_NAME"
            else
                err "system install requires root or sudo"
            fi
        else
            mkdir -p "$install_dir"
            mv "$tmp_dir/$BIN_NAME" "$install_dir/$BIN_NAME"
        fi
    else
        mkdir -p "$install_dir"
        mv "$tmp_dir/$BIN_NAME" "$install_dir/$BIN_NAME"
    fi
}

check_path() {
    local install_dir="$1"
    case ":$PATH:" in
        *":$install_dir:"*) return 0 ;;
    esac

    msg ""
    msg "⚠  $install_dir is not in your PATH."
    msg ""
    msg "   Add it to your shell config:"
    msg ""
    msg "     echo 'export PATH=\"$install_dir:\$PATH\"' >> ~/.bashrc"
    msg "     echo 'export PATH=\"$install_dir:\$PATH\"' >> ~/.zshrc"
    msg ""
    msg "   Then restart your shell or run:"
    msg "     export PATH=\"$install_dir:\$PATH\""
    msg ""
}

main() {
    need_cmd curl
    need_cmd tar
    need_cmd uname

    local os arch version install_dir
    os="$(detect_os)"
    arch="$(detect_arch)"
    version="$(resolve_version)"
    install_dir="$(resolve_install_dir)"

    msg ">>> hapi installer (dmnkf fork)"
    msg "    OS:      $os"
    msg "    Arch:    $arch"
    msg "    Version: $version"
    msg "    Dest:    $install_dir/$BIN_NAME"
    msg ""

    download_and_install "$os" "$arch" "$version" "$install_dir"

    msg ""
    msg "✓ Installed: $install_dir/$BIN_NAME"

    if [ -x "$install_dir/$BIN_NAME" ]; then
        msg ""
        "$install_dir/$BIN_NAME" --version 2>&1 || true
    fi

    check_path "$install_dir"

    msg ""
    msg "Next steps:"
    msg "  hapi auth login         # authenticate with your hub"
    msg "  hapi hub --relay        # start hub with relay (for remote access)"
    msg "  hapi runner start       # start runner daemon for remote spawn"
    msg ""
    msg "Docs: https://github.com/${REPO}"
}

main "$@"
