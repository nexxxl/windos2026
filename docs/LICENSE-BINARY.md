# NexlOS Binary License 1.0

Effective: 2026-11-16 · Licensor: NexlOS Authors

**Scope.** This license applies only to compiled release binaries of the NexlOS
**universal edition**, distributed from this repository's Releases page or
another official channel. It does not apply to source code in this repository,
and it does not apply to the plugin edition.

**Open components inside the binary.** The universal binaries embed the desktop
layer whose source is published in this repository under the Apache License 2.0.
For those components the Apache-2.0 grant in [LICENSE](../LICENSE) applies to the
copy you receive, this license adds no restriction on them, and nothing here
revokes rights you already hold. The additional terms below cover only the
components that are **not** present in this repository's source tree: the Go
kernel and the native window shell (together, the "Closed Components").

The license map, including third-party assets, is in [LICENSING.md](legal/LICENSING.md).

## 1. Grant

Subject to this license, NexlOS Authors grants you a worldwide, non-exclusive,
non-transferable, revocable license to:

1. install and run the binaries on devices you own or control;
2. use them for personal, research, evaluation and internal business purposes;
3. make a reasonable number of backup copies, provided every copy keeps all
   copyright, trademark and license notices.

No rights are granted in the Closed Components' source code, in any trademark, or
in any patent except as stated in the Apache-2.0 grant for open components.

## 2. Conditions for the Closed Components

Except where applicable law expressly permits and cannot be excluded, you may not:

1. redistribute, sublicense, rent, lend, sell or publicly offer the Closed
   Components, or a binary whose Closed Components you have modified;
2. remove, obscure or alter any copyright, trademark, license or attribution
   notice;
3. present a build of your own, or a modified binary, as an official NexlOS
   release, or use NexlOS or Windos2026 names, logos or icons to promote it;
4. bypass or disable licensing, signature, update or security mechanisms.

Using a release binary for your internal business is permitted. Offering paid
hosting, white-labelling, OEM bundling or redistribution of the Closed
Components requires written permission; open an issue titled `licensing`.

## 3. Apache-2.0 components inside the binary

Nothing in section 2 restricts the rights Apache-2.0 gives you in the open
components, including the rights to reproduce, modify and redistribute those
components, and to receive the corresponding source. If this license conflicts
with Apache-2.0 for those components, Apache-2.0 governs them. You may build the
universal edition's desktop layer from this repository and distribute your build
under Apache-2.0; it will not be the official universal binary.

## 4. Third-party components

The binaries include third-party components under their own licenses, listed in
[THIRD_PARTY_NOTICES.md](legal/THIRD_PARTY_NOTICES.md) and in the release assets. Where
a third-party license conflicts with this license, that license governs the
third-party component.

## 5. Updates and support

NexlOS Authors may provide updates, patches or support at its discretion and has
no obligation to continue doing so. Updates can change features, compatibility or
system requirements. You may decline an update; older versions may stop receiving
security fixes.

## 6. Termination

This license terminates automatically if you breach it. On termination you must
stop using the binaries and delete all copies. Sections 2, 3, 4, 7, 8 and 9
survive termination.

## 7. No warranty

The binaries are provided "as is", without express or implied warranties.
[DISCLAIMER.md](legal/DISCLAIMER.md) states the complete terms and prevails over this
section.

## 8. Limitation of liability

To the maximum extent permitted by law, NexlOS Authors is not liable for indirect,
incidental, special or consequential damages, or for lost profits, revenue, data,
goodwill or business interruption. The aggregate liability cap is stated in
[DISCLAIMER.md](legal/DISCLAIMER.md).

## 9. Export control and sanctions

You may not use, export or re-export the binaries in violation of applicable
export-control and sanctions laws.

## 10. Governing law

This license is governed by the laws of the licensor's principal place of
business, excluding conflict-of-law rules. Disputes are resolved by good-faith
negotiation first, then by the courts of that jurisdiction. A separate commercial
agreement may specify a different venue or arbitration.

## 11. Contact

Licensing and commercial permissions: open an issue titled `licensing`.
Security reports: use the repository's Security Advisory, never a public issue
with exploit details.
