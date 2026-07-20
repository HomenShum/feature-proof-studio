import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  EvidenceError,
  buildEvidenceReceipt,
  buildNodeKitEvidenceIndex,
  verifyEvidenceManifest,
} from "../scripts/featureclip-evidence.mjs";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function png(width = 2, height = 3) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function runGit(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function makeRepo(t) {
  const root = mkdtempSync(join(tmpdir(), "featureclip-evidence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bytes = png();
  mkdirSync(join(root, "assets"), { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, "assets", "frame.png"), bytes);
  writeFileSync(join(root, "README.md"), "# fixture\n");
  const manifest = {
    schemaVersion: "featureclip.evidence-manifest/v1",
    repository: "HomenShum/FeatureClipStudio",
    collectionId: "fixture",
    nodekitChangeId: "change-fixture",
    requireGitTracked: true,
    artifacts: [
      {
        id: "frame",
        title: "Fixture frame",
        artifactKind: "screenshot",
        path: "assets/frame.png",
        mediaType: "image/png",
        sha256: sha256(bytes),
        bytes: bytes.length,
        dimensions: { width: 2, height: 3 },
        sourceTruth: {
          representation: "captured-product-ui",
          captureEnvironment: "local-fixture",
          artifactVerification: "repository-bytes",
          workflowVerification: "unverified",
          verificationReceipt: null,
        },
        basis: [{
          path: "README.md",
          digestMode: "normalized-text-sha256",
          sha256: sha256(Buffer.from("# fixture\n")),
        }],
        limitations: ["Fixture-only evidence."],
      },
    ],
  };
  writeJson(join(root, "evidence", "nodekit-present.manifest.json"), manifest);
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["add", "README.md", "assets/frame.png", "evidence/nodekit-present.manifest.json"]);
  return { root, manifest, bytes };
}

function persistManifest(root, manifest) {
  writeJson(join(root, "evidence", "nodekit-present.manifest.json"), manifest);
}

test("verifies tracked bytes and projects an honest observed evidence record", (t) => {
  const { root } = makeRepo(t);
  const verified = verifyEvidenceManifest(root);
  const projected = buildNodeKitEvidenceIndex(verified);
  const receipt = buildEvidenceReceipt(verified, projected);

  assert.equal(verified.artifacts.length, 1);
  assert.equal(projected.schemaVersion, "nodekit.evidence-index/v1");
  assert.equal(projected.evidence[0].status, "observed");
  assert.match(projected.evidence[0].summary, /no committed independent workflow receipt/);
  assert.equal(receipt.checks.passed, true);
  assert.equal(receipt.checks.independentWorkflowReceipts, 0);
  assert.equal(receipt.claimBoundary.releaseReady, false);
  assert.equal(receipt.claimBoundary.productWorkflowProof, "not-certified");
});

test("fails closed when a declared artifact is missing", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts[0].path = "assets/missing.png";
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /does not exist/);
});

test("fails closed when an artifact exists but is not Git-tracked", (t) => {
  const { root, manifest } = makeRepo(t);
  const bytes = png(5, 6);
  writeFileSync(join(root, "assets", "untracked.png"), bytes);
  Object.assign(manifest.artifacts[0], {
    path: "assets/untracked.png",
    sha256: sha256(bytes),
    bytes: bytes.length,
    dimensions: { width: 5, height: 6 },
  });
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /is not tracked by Git/);
});

test("fails closed on repository path traversal", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts[0].path = "../outside.png";
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /unsafe path segment/);
});

test("fails closed on digest drift", (t) => {
  const { root } = makeRepo(t);
  writeFileSync(join(root, "assets", "frame.png"), png(4, 4));
  assert.throws(() => verifyEvidenceManifest(root), /digest drift/);
});

test("fails closed on declared metadata drift", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts[0].dimensions.width = 99;
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /dimension drift/);
});

test("fails closed on provenance-basis drift", (t) => {
  const { root } = makeRepo(t);
  writeFileSync(join(root, "README.md"), "# changed fixture\n");
  assert.throws(() => verifyEvidenceManifest(root), /basis\[0\] digest drift/);
});

test("fails closed on case-insensitive duplicate ids", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts.push({ ...structuredClone(manifest.artifacts[0]), id: "frame" });
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /duplicate artifact id/);
});

test("fails closed on duplicate artifact paths", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts.push({ ...structuredClone(manifest.artifacts[0]), id: "other-frame" });
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /duplicate artifact path/);
});

test("fails closed when generated media is labeled like a real capture", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts[0].sourceTruth.representation = "generated-illustration";
  manifest.artifacts[0].sourceTruth.captureEnvironment = "deployed-application";
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /generated illustrations must use captureEnvironment=unknown/);
});

test("fails closed when an unverified artifact attaches a receipt", (t) => {
  const { root, manifest } = makeRepo(t);
  manifest.artifacts[0].sourceTruth.verificationReceipt = {
    path: "proof/fake.json",
    sha256: "0".repeat(64),
    schemaVersion: "fake/v1",
  };
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), /cannot attach a verification receipt/);
});

test("projects verified only when a matching independent receipt is tracked", (t) => {
  const { root, manifest } = makeRepo(t);
  const receipt = Buffer.from('{"schemaVersion":"browser.receipt/v1"}\n');
  mkdirSync(join(root, "proof"), { recursive: true });
  writeFileSync(join(root, "proof", "browser.json"), receipt);
  runGit(root, ["add", "proof/browser.json"]);
  manifest.artifacts[0].sourceTruth.workflowVerification = "browser-receipt";
  manifest.artifacts[0].sourceTruth.verificationReceipt = {
    path: "proof/browser.json",
    sha256: sha256(receipt),
    schemaVersion: "browser.receipt/v1",
  };
  persistManifest(root, manifest);

  const verified = verifyEvidenceManifest(root);
  const projection = buildNodeKitEvidenceIndex(verified);
  assert.equal(projection.evidence[0].status, "verified");
  assert.match(projection.evidence[0].summary, /browser-receipt browser\.receipt\/v1/);
});

test("fails closed on a symlink escape when the platform permits creating one", (t) => {
  const { root, manifest } = makeRepo(t);
  const outside = mkdtempSync(join(tmpdir(), "featureclip-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "frame.png"), png());
  try {
    symlinkSync(join(outside, "frame.png"), join(root, "assets", "linked.png"), "file");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("filesystem does not permit symlink creation");
      return;
    }
    throw error;
  }
  runGit(root, ["add", "assets/linked.png"]);
  manifest.artifacts[0].path = "assets/linked.png";
  persistManifest(root, manifest);
  assert.throws(() => verifyEvidenceManifest(root), EvidenceError);
  assert.throws(() => verifyEvidenceManifest(root), /outside the repository root|must not be a symbolic link/);
});
