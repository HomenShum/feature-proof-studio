# NodeKit Present evidence bridge

FeatureClipStudio is a presentation-evidence tool, not a product-agent runtime. Its
NodeKit integration exposes checked-in clips and screenshots to a Change Story or
NodeSlide deck without upgrading a media file into a stronger proof claim than the
repository can support.

## Contract

`evidence/nodekit-present.manifest.json` is the authored manifest. Every entry must
declare:

- an existing Git-tracked GIF or PNG;
- its SHA-256 digest, byte size, MIME signature, and dimensions;
- whether it is captured UI, rendered capture, or generated illustration;
- whether the capture came from a deployed application, local fixture, or is unknown;
- whether a separate judge/browser receipt is committed; and
- content-addressed source files and limitations that explain the provenance boundary.

The verifier fails closed on missing or untracked files, absolute/traversing paths,
symlink escapes, duplicate IDs or paths, media-signature mismatch, digest/size/dimension
drift, provenance-basis drift, stale receipt references, and
generated-versus-captured ambiguity.

## Commands

```bash
npm run doctor
npm run evidence:check
npm run evidence:project
npm run proof
npm run check
```

`evidence:project` writes two deterministic artifacts:

- `proof/nodekit-present.evidence-index.json`, consumable by the
  `nodekit.evidence-index/v1` Change Story lane; and
- `proof/featureclip-evidence.receipt.json`, which records the exact content and the
  claim boundary used for projection. Text-basis digests normalize line endings and
  JSON contract digests use canonical key ordering, so the same committed source
  verifies on Windows, macOS, and Linux.

`proof` does not write. It recomputes both outputs and fails if the committed files are
missing or stale.

## Status semantics

Repository byte verification is not workflow verification.

- A checked-in file with matching digest, size, signature, dimensions, and provenance
  projects as `observed` when no independent workflow receipt is committed.
- It can project as `verified` only when the manifest references a matching committed
  judge or browser receipt with an explicit schema version.
- Generated illustrations can never certify a product workflow.

The initial P1 manifest deliberately contains zero independent workflow receipts.
FeatureClipStudio documents a runnable Gemini judge, but its existing per-clip judge
JSON is written to ignored `out/` paths and is not committed. The receipt therefore
sets `releaseReady: false` and `productWorkflowProof: not-certified`.

## Safe consumption

NodeKit Present or NodeSlide may use the projected assets as supplemental presentation
material. Consumers must retain `status`, the content-addressed location, and the
summary boundary. They must not relabel an `observed` asset as fresh production-browser
proof or claim that its depicted workflow passed the judge.
