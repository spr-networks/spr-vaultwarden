# Vaultwarden for SPR

Run a private, Bitwarden-compatible password vault on an SPR router. The plugin packages the Vaultwarden server, an SPR-native management UI, persistent configuration, and direct TLS certificate management in one container.

Vaultwarden listens on port `8989` by default. The management API and UI are exposed to SPR through `/state/plugins/vaultwarden/socket`.

## Install

Install from the SPR plugin UI, or use the command-line helper:

```sh
./install.sh
```

The compose project stores persistent data below these SPR directories:

- `state/plugins/vaultwarden/` — plugin socket and state
- `configs/plugins/vaultwarden/configs/` — `.env` configuration
- `configs/plugins/vaultwarden/data/` — the encrypted vault database and attachments

## Configure

Open **Plugins → Vaultwarden** in SPR. The UI separates normal administration from the full upstream configuration:

- **Overview** — deployment health, essential settings, and TLS files
- **Access** — registration, invitations, organizations, hints, and admin access
- **Email** — SMTP delivery for invitations and security notifications
- **Advanced** — searchable access to every setting, one category at a time

Changes are staged until **Apply changes** is selected. Applying writes `/configs/.env` and restarts Vaultwarden once. If the optional Vaultwarden admin page is enabled, changes made there may override values managed by this plugin.

## HTTPS

Bitwarden clients require a trusted HTTPS origin for Web Crypto features. Self-signed certificates are generally not accepted.

Choose one of these approaches:

1. Upload a matching trusted certificate and private key on the plugin Overview, then enable `ROCKET_TLS` under **Advanced → Rocket settings**.
2. Terminate HTTPS at a trusted reverse proxy and set `DOMAIN` to its public HTTPS URL.
3. For local maintenance only, forward the service to loopback:

   ```sh
   ssh -L 8989:localhost:8989 ubuntu@spr.local
   ```

See the [Vaultwarden HTTPS documentation](https://github.com/dani-garcia/vaultwarden/wiki/Enabling-HTTPS) for certificate and proxy details.

## Reproducible builds and CI

Build inputs are pinned in `reproducible.env`, including the Vaultwarden release image, BuildKit, Node, Ubuntu snapshot, and Go toolchain. Refresh them with:

```sh
./update-pins.sh
git diff
```

`./build_docker_compose.sh --load` produces a local image with normalized timestamps. The GitHub Actions workflows follow the other SPR plugins:

- pushes to `main` and `dev` create semantic version tags when commit messages request a bump;
- `dev` publishes `latest-dev` and versioned development images;
- successful `main` version workflows publish versioned and `latest` multi-architecture images to GHCR;
- published images are signed with keyless Sigstore identities and receive SLSA provenance attestations.

The upstream Vaultwarden runtime is pinned to an immutable version and manifest digest, so a rebuild cannot silently pick up a different server image.
