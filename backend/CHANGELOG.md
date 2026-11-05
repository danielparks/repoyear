# Change log

All notable changes to this project will be documented in this file.

## main branch

### Security

- Upgrade h2 to fix [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258). It’s unclear if this crate was affected.
- Upgrade spin to avoid yanked version.
- Upgrade tokio to fix [RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386) (I/O safety). It’s unclear if this crate was affected.
