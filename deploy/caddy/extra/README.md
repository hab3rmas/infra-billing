# Optional Caddy snippets

Every `*.caddy` file in this folder is loaded into the site block (see `../../Caddyfile`).
Copy an example without the `.example` suffix to switch it on, then `docker compose restart caddy`:

- `basic-auth.caddy.example`  a second password in front of the whole panel (recommended)
- `ip-allowlist.caddy.example`  only your own addresses may connect at all

Your active `*.caddy` files stay out of git (they hold a password hash or your IPs).
