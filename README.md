# HAPI (dmnkf fork)

Run official Claude Code / Codex / Gemini / OpenCode sessions locally and control them remotely through a Web / PWA / Telegram Mini App.

> **Fork notice**: This is [@dmnkf](https://github.com/dmnkf)'s fork of [tiann/hapi](https://github.com/tiann/hapi) with redesigned PWA UX, terminal stability fixes, machine-wide directory browsing, and Linux-first deployment. See [upstream](https://github.com/tiann/hapi) for the original project.

> **Why HAPI?** HAPI is a local-first alternative to Happy. See [Why Not Happy?](docs/guide/why-hapi.md) for the key differences.

## Features

- **Seamless Handoff** - Work locally, switch to remote when needed, switch back anytime. No context loss, no session restart.
- **Native First** - HAPI wraps your AI agent instead of replacing it. Same terminal, same experience, same muscle memory.
- **AFK Without Stopping** - Step away from your desk? Approve AI requests from your phone with one tap.
- **Your AI, Your Choice** - Claude Code, Codex, Cursor Agent, Gemini, OpenCode—different models, one unified workflow.
- **Terminal Anywhere** - Run commands from your phone or browser, directly connected to the working machine.
- **Voice Control** - Talk to your AI agent hands-free using the built-in voice assistant.

## Demo

https://github.com/user-attachments/assets/38230353-94c6-4dbe-9c29-b2a2cc457546

## Install

### Linux / macOS (one-liner, no Node.js required)

```bash
curl -fsSL https://raw.githubusercontent.com/dmnkf/hapi/main/scripts/install.sh | bash
```

Installs to `~/.local/bin/hapi`. For system-wide install: `curl -fsSL ... | HAPI_SYSTEM=1 bash`.

### via npm (cross-platform)

```bash
npm install -g @dmnkf/hapi
```

### Manual download

Prebuilt binaries for Linux, macOS, and Windows are available on the [releases page](https://github.com/dmnkf/hapi/releases).

## Migrating from upstream

Already using the upstream `tiann/hapi`? This fork is a **drop-in replacement** — same `hapi` binary name, same `~/.hapi` config directory, same `HAPI_*` env vars, same DB schema. Your existing sessions, auth tokens, JWT secret, and settings all keep working. Only the installation source changes.

### If you installed via `curl | bash` or manual download

Just run the fork's install script — it overwrites the binary:

```bash
curl -fsSL https://raw.githubusercontent.com/dmnkf/hapi/main/scripts/install.sh | bash
hapi --version   # should print 0.17.0-dmnkf.1 or later
```

### If you installed via npm

```bash
npm uninstall -g @twsxtd/hapi
npm install -g @dmnkf/hapi
```

### If you installed via Homebrew

The fork doesn't ship a Homebrew tap. Uninstall the upstream formula and switch to the install script or npm:

```bash
brew uninstall hapi
curl -fsSL https://raw.githubusercontent.com/dmnkf/hapi/main/scripts/install.sh | bash
```

### Update running services

If you run `hapi hub` / `hapi runner` under launchd, systemd, or pm2, the service files reference the old binary path. After reinstalling:

```bash
which hapi                       # confirm new binary location
# Update your launchd plist / systemd unit / pm2 config to point here
# Then restart the service
```

No data migration, no re-auth, no session re-creation needed.

## Getting Started

```bash
hapi hub --relay     # start hub with E2E encrypted relay
hapi                 # run claude code
```

`hapi server` remains supported as an alias.

The terminal will display a URL and QR code. Scan the QR code with your phone or open the URL to access.

> The relay uses WireGuard + TLS for end-to-end encryption. Your data is encrypted from your device to your machine.

For self-hosted options (Cloudflare Tunnel, Tailscale), see [Installation](docs/guide/installation.md)

## Docs

- [App](docs/guide/pwa.md)
- [How it Works](docs/guide/how-it-works.md)
- [Cursor Agent](docs/guide/cursor.md)
- [Voice Assistant](docs/guide/voice-assistant.md)
- [Why HAPI](docs/guide/why-hapi.md)
- [FAQ](docs/guide/faq.md)

## Build from source

```bash
bun install
bun run build:single-exe
```

## Credits

HAPI means "哈皮" a Chinese transliteration of [Happy](https://github.com/slopus/happy). Great credit to the original project and to [tiann/hapi](https://github.com/tiann/hapi) (the upstream this fork is based on).
