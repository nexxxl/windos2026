# NEXL-HTML L1 bundle

Copyright (c) 2026 NexlOS Authors.

This bundle is a first-party component built from the NexlOS repository's own
NEXL-HTML L1-DOM-JIT sources. It is not a third-party dependency and carries no
upstream copyright other than NexlOS Authors. It is listed here so the Apache-2.0
scope of the file is explicit.

- Protocol: NEXL-HTML
- License: Apache-2.0 (full text in `nexl-l1-LICENSE.txt`)
- Bundle: esbuild IIFE, exposes `NEXL_L1` with `serializeDom`, `NexlStateStack`,
  `extractBytecode`, `NodeRole`, `ActionMask`
- Build: generated from the repository's `core/` sources; no vendored copy of an
  external parser is included
