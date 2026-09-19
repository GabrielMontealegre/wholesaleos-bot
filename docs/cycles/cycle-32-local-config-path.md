# Cycle 32: Cross-Platform Local Helper Configuration

## What changed

The local comp helper now finds a private, writable configuration folder before it starts. On Windows it prefers the current user's Local App Data folder, on macOS it uses Application Support, and on Linux it follows the XDG state/config folders before the standard user config folder. A custom `WOS_HELPER_CONFIG` file or `WOS_HELPER_HOME` directory still takes precedence.

The helper proves that a candidate directory is writable by creating and deleting a tiny probe file. It does not trust an environment variable merely because the folder exists. The pairing token is never printed, and the resolver never falls back to a temporary directory or the WholesaleOS repository.

## Existing installations

An existing `.wholesaleos/helper.json` is read only as a legacy fallback. When a new writable location is available and empty, the helper copies the existing configuration once, attempts to remove the legacy file, and then continues from the new location. A failed legacy removal is reported by path only and does not expose the file contents.

## Start the helper

Double-click `scripts/Start-WholesaleOS-Helper.cmd`. The window prints the resolved configuration directory, then starts the loopback-only helper. If every candidate is blocked, it lists the attempted folders and tells you to set `WOS_HELPER_HOME` to a folder you can write to.

Pairing, dashboard login, capture eligibility, evidence provenance, and the strict comp grid are unchanged. The helper still opens no listing page until the operator explicitly clicks Capture on a complete, source-supported property row.
