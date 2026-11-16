# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Older releases | Best effort |

This directory maintains the plugin edition. Other editions are independent release lines; a fix here does not automatically cover them.

## Reporting a vulnerability

Use GitHub Security Advisories on this repository:

1. Open the **Security** tab.
2. Choose **Report a vulnerability**.
3. Include affected version, platform, reproduction steps, and impact.

Do not open a public issue for a vulnerability that is not yet fixed. Do not include live credentials, private keys, or personal data in a report.

We aim to acknowledge reports within 72 hours and to provide a remediation plan within 7 days. These are best-effort targets, not contractual SLAs.

## Scope

In scope:

- The plugin source at this directory root and its bundled `src/webos/`.
- The build, packaging, and update paths in this repository.

Out of scope:

- Third-party applications, plugins, and forks.
- Modified builds that are not distributed by NexlOS Authors.
- Issues that require physical access to an unlocked device.
- Social engineering and denial-of-service against third-party infrastructure.

## Disclosure

We will credit reporters who want credit. We will publish an advisory after a fix is available, or earlier if the issue is already public.
