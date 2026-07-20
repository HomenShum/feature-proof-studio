#!/usr/bin/env node

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MANIFEST_SCHEMA = "featureclip.evidence-manifest/v1";
const RECEIPT_SCHEMA = "featureclip.evidence-receipt/v1";
const EVIDENCE_INDEX_SCHEMA = "nodekit.evidence-index/v1";
const DEFAULT_MANIFEST = "evidence/nodekit-present.manifest.json";
const DEFAULT_PROJECTION = "proof/nodekit-present.evidence-index.json";
const DEFAULT_RECEIPT = "proof/featureclip-evidence.receipt.json";

const ROOT_KEYS = [
  "schemaVersion",
  "repository",
  "collectionId",
  "nodekitChangeId",
  "requireGitTracked",
  "artifacts",
];
const ARTIFACT_KEYS = [
  "id",
  "title",
  "artifactKind",
  "path",
  "mediaType",
  "sha256",
  "bytes",
  "dimensions",
  "sourceTruth",
  "basis",
  "limitations",
];
const SOURCE_TRUTH_KEYS = [
  "representation",
  "captureEnvironment",
  "artifactVerification",
  "workflowVerification",
  "verificationReceipt",
];
const RECEIPT_REF_KEYS = ["path", "sha256", "schemaVersion"];
const BASIS_KEYS = ["path", "digestMode", "sha256"];
const REPRESENTATIONS = new Set([
  "captured-product-ui",
  "rendered-from-captured-product-ui",
  "generated-illustration",
]);
const CAPTURE_ENVIRONMENTS = new Set(["deployed-application", "local-fixture", "unknown"]);
const WORKFLOW_VERIFICATIONS = new Set(["unverified", "judge-receipt", "browser-receipt"]);
const MEDIA_TYPES = new Map([
  [".gif", "image/gif"],
  [".png", "image/png"],
]);

export class EvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceError";
  }
}

function fail(message) {
  throw new EvidenceError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const missing = wanted.filter((key) => !actual.includes(key));
  const unknown = actual.filter((key) => !wanted.includes(key));
  if (missing.length || unknown.length) {
    fail(`${label} fields are invalid (missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"})`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} must be a non-empty string`);
}

function assertStringArray(value, label, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min) fail(`${label} must contain at least ${min} item(s)`);
  const seen = new Set();
  value.forEach((item, index) => {
    assertNonEmptyString(item, `${label}[${index}]`);
    const folded = item.toLowerCase();
    if (seen.has(folded)) fail(`${label} contains duplicate value ${item}`);
    seen.add(folded);
  });
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalJsonSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function prettyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizedTextSha256(buffer, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail(`${label} is not valid UTF-8 text`);
  }
  return sha256(Buffer.from(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8"));
}

function safeRelativePath(input, label) {
  assertNonEmptyString(input, label);
  if (isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith("\\\\")) {
    fail(`${label} must be repository-relative`);
  }
  if (input.includes("\\")) fail(`${label} must use forward slashes`);
  const parts = input.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail(`${label} contains an unsafe path segment`);
  }
  return input;
}

function isContained(rootReal, targetReal) {
  const delta = relative(rootReal, targetReal);
  return delta === "" || (!delta.startsWith(`..${sep}`) && delta !== ".." && !isAbsolute(delta));
}

function resolveExistingContainedFile(rootReal, relativePath, label) {
  const safe = safeRelativePath(relativePath, label);
  const lexical = resolve(rootReal, safe);
  if (!isContained(rootReal, lexical)) fail(`${label} escapes the repository root`);
  let real;
  try {
    real = realpathSync(lexical);
  } catch {
    fail(`${label} does not exist: ${safe}`);
  }
  if (!isContained(rootReal, real)) fail(`${label} resolves outside the repository root`);
  const direct = lstatSync(lexical);
  if (direct.isSymbolicLink()) fail(`${label} must not be a symbolic link`);
  const stat = statSync(real);
  if (!stat.isFile()) fail(`${label} must resolve to a regular file`);
  return { safe, real, stat };
}

function verifyGitTracked(rootReal, relativePath, label) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", relativePath], {
    cwd: rootReal,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) fail(`${label} is not tracked by Git: ${relativePath}`);
}

function readImageMetadata(buffer, mediaType, label) {
  if (mediaType === "image/png") {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) fail(`${label} is not a valid PNG signature`);
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mediaType === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    if (buffer.length < 10 || (signature !== "GIF87a" && signature !== "GIF89a")) {
      fail(`${label} is not a valid GIF signature`);
    }
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  fail(`${label} uses unsupported media type ${mediaType}`);
}

function validateManifestShape(manifest) {
  assertExactKeys(manifest, ROOT_KEYS, "manifest");
  if (manifest.schemaVersion !== MANIFEST_SCHEMA) fail(`manifest schemaVersion must be ${MANIFEST_SCHEMA}`);
  if (manifest.repository !== "HomenShum/FeatureClipStudio") fail("manifest repository must be HomenShum/FeatureClipStudio");
  assertNonEmptyString(manifest.collectionId, "manifest.collectionId");
  assertNonEmptyString(manifest.nodekitChangeId, "manifest.nodekitChangeId");
  if (manifest.requireGitTracked !== true) fail("manifest.requireGitTracked must be true");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) fail("manifest.artifacts must not be empty");

  const ids = new Set();
  const paths = new Set();
  for (const [index, artifact] of manifest.artifacts.entries()) {
    const label = `manifest.artifacts[${index}]`;
    assertExactKeys(artifact, ARTIFACT_KEYS, label);
    assertNonEmptyString(artifact.id, `${label}.id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(artifact.id)) fail(`${label}.id must be kebab-case`);
    const foldedId = artifact.id.toLowerCase();
    if (ids.has(foldedId)) fail(`duplicate artifact id ${artifact.id}`);
    ids.add(foldedId);
    assertNonEmptyString(artifact.title, `${label}.title`);
    if (!new Set(["clip", "screenshot"]).has(artifact.artifactKind)) fail(`${label}.artifactKind is unsupported`);
    safeRelativePath(artifact.path, `${label}.path`);
    const foldedPath = artifact.path.toLowerCase();
    if (paths.has(foldedPath)) fail(`duplicate artifact path ${artifact.path}`);
    paths.add(foldedPath);
    const expectedMediaType = MEDIA_TYPES.get(extname(artifact.path).toLowerCase());
    if (!expectedMediaType || artifact.mediaType !== expectedMediaType) fail(`${label}.mediaType does not match the file extension`);
    if (artifact.artifactKind === "clip" && artifact.mediaType !== "image/gif") fail(`${label} clips must be GIFs in v1`);
    if (artifact.artifactKind === "screenshot" && artifact.mediaType !== "image/png") fail(`${label} screenshots must be PNGs in v1`);
    if (typeof artifact.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.sha256)) fail(`${label}.sha256 is invalid`);
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 1) fail(`${label}.bytes must be a positive integer`);
    assertExactKeys(artifact.dimensions, ["width", "height"], `${label}.dimensions`);
    if (!Number.isSafeInteger(artifact.dimensions.width) || artifact.dimensions.width < 1) fail(`${label}.dimensions.width is invalid`);
    if (!Number.isSafeInteger(artifact.dimensions.height) || artifact.dimensions.height < 1) fail(`${label}.dimensions.height is invalid`);
    assertExactKeys(artifact.sourceTruth, SOURCE_TRUTH_KEYS, `${label}.sourceTruth`);
    const truth = artifact.sourceTruth;
    if (!REPRESENTATIONS.has(truth.representation)) fail(`${label}.sourceTruth.representation is unsupported`);
    if (!CAPTURE_ENVIRONMENTS.has(truth.captureEnvironment)) fail(`${label}.sourceTruth.captureEnvironment is unsupported`);
    if (truth.artifactVerification !== "repository-bytes") fail(`${label}.sourceTruth.artifactVerification must be repository-bytes`);
    if (!WORKFLOW_VERIFICATIONS.has(truth.workflowVerification)) fail(`${label}.sourceTruth.workflowVerification is unsupported`);
    if (truth.workflowVerification === "unverified" && truth.verificationReceipt !== null) {
      fail(`${label} cannot attach a verification receipt while workflowVerification is unverified`);
    }
    if (truth.workflowVerification !== "unverified") {
      assertExactKeys(truth.verificationReceipt, RECEIPT_REF_KEYS, `${label}.sourceTruth.verificationReceipt`);
      safeRelativePath(truth.verificationReceipt.path, `${label}.sourceTruth.verificationReceipt.path`);
      if (!/^[a-f0-9]{64}$/.test(truth.verificationReceipt.sha256)) fail(`${label}.sourceTruth.verificationReceipt.sha256 is invalid`);
      assertNonEmptyString(truth.verificationReceipt.schemaVersion, `${label}.sourceTruth.verificationReceipt.schemaVersion`);
    }
    if (truth.representation === "generated-illustration") {
      if (truth.captureEnvironment !== "unknown") fail(`${label} generated illustrations must use captureEnvironment=unknown`);
      if (truth.workflowVerification !== "unverified") fail(`${label} generated illustrations cannot certify a product workflow`);
    } else if (truth.captureEnvironment === "unknown") {
      fail(`${label} captured product UI must declare its capture environment`);
    }
    if (!Array.isArray(artifact.basis) || artifact.basis.length === 0) fail(`${label}.basis must not be empty`);
    const basisPaths = new Set();
    artifact.basis.forEach((basis, basisIndex) => {
      const basisLabel = `${label}.basis[${basisIndex}]`;
      assertExactKeys(basis, BASIS_KEYS, basisLabel);
      safeRelativePath(basis.path, `${basisLabel}.path`);
      if (basis.digestMode !== "normalized-text-sha256") fail(`${basisLabel}.digestMode is unsupported`);
      if (!/^[a-f0-9]{64}$/.test(basis.sha256)) fail(`${basisLabel}.sha256 is invalid`);
      const foldedBasisPath = basis.path.toLowerCase();
      if (basisPaths.has(foldedBasisPath)) fail(`${label}.basis contains duplicate path ${basis.path}`);
      basisPaths.add(foldedBasisPath);
    });
    assertStringArray(artifact.limitations, `${label}.limitations`, { min: 1 });
  }
}

export function verifyEvidenceManifest(root, manifestPath = DEFAULT_MANIFEST) {
  const rootReal = realpathSync(root);
  const manifestFile = resolveExistingContainedFile(rootReal, manifestPath, "manifest path");
  const manifestBytes = readFileSync(manifestFile.real);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch (error) {
    fail(`manifest is not valid JSON: ${error.message}`);
  }
  validateManifestShape(manifest);
  if (manifest.requireGitTracked) verifyGitTracked(rootReal, manifestFile.safe, "manifest path");

  const verifiedArtifacts = manifest.artifacts.map((artifact, index) => {
    const label = `artifact ${artifact.id}`;
    const file = resolveExistingContainedFile(rootReal, artifact.path, `${label} path`);
    if (manifest.requireGitTracked) verifyGitTracked(rootReal, file.safe, `${label} path`);
    const bytes = readFileSync(file.real);
    const digest = sha256(bytes);
    if (digest !== artifact.sha256) fail(`${label} digest drift: expected ${artifact.sha256}, received ${digest}`);
    if (file.stat.size !== artifact.bytes) fail(`${label} byte-size drift: expected ${artifact.bytes}, received ${file.stat.size}`);
    const dimensions = readImageMetadata(bytes, artifact.mediaType, label);
    if (dimensions.width !== artifact.dimensions.width || dimensions.height !== artifact.dimensions.height) {
      fail(`${label} dimension drift: expected ${artifact.dimensions.width}x${artifact.dimensions.height}, received ${dimensions.width}x${dimensions.height}`);
    }

    const verifiedBasis = [];
    for (const [basisIndex, basisRef] of artifact.basis.entries()) {
      const basis = resolveExistingContainedFile(rootReal, basisRef.path, `${label} basis[${basisIndex}]`);
      if (manifest.requireGitTracked) verifyGitTracked(rootReal, basis.safe, `${label} basis[${basisIndex}]`);
      const basisDigest = normalizedTextSha256(readFileSync(basis.real), `${label} basis[${basisIndex}]`);
      if (basisDigest !== basisRef.sha256) fail(`${label} basis[${basisIndex}] digest drift`);
      verifiedBasis.push({ path: basis.safe, digestMode: basisRef.digestMode, sha256: basisDigest });
    }

    let verificationReceipt = null;
    if (artifact.sourceTruth.verificationReceipt) {
      const receiptRef = artifact.sourceTruth.verificationReceipt;
      const receiptFile = resolveExistingContainedFile(rootReal, receiptRef.path, `${label} verification receipt`);
      if (manifest.requireGitTracked) verifyGitTracked(rootReal, receiptFile.safe, `${label} verification receipt`);
      const receiptBytes = readFileSync(receiptFile.real);
      const receiptDigest = sha256(receiptBytes);
      if (receiptDigest !== receiptRef.sha256) fail(`${label} verification receipt digest drift`);
      let parsed;
      try {
        parsed = JSON.parse(receiptBytes.toString("utf8"));
      } catch {
        fail(`${label} verification receipt is not valid JSON`);
      }
      if (parsed.schemaVersion !== receiptRef.schemaVersion) fail(`${label} verification receipt schema drift`);
      verificationReceipt = { path: receiptRef.path, sha256: receiptDigest, schemaVersion: parsed.schemaVersion };
    }

    return {
      id: artifact.id,
      title: artifact.title,
      artifactKind: artifact.artifactKind,
      path: artifact.path,
      mediaType: artifact.mediaType,
      sha256: digest,
      bytes: file.stat.size,
      dimensions,
      gitTracked: manifest.requireGitTracked,
      sourceTruth: artifact.sourceTruth,
      basis: verifiedBasis,
      limitations: artifact.limitations,
      verificationReceipt,
      metadataMatched: true,
    };
  });

  return {
    root: rootReal,
    manifestPath: manifestFile.safe,
    manifestSha256: canonicalJsonSha256(manifest),
    manifest,
    artifacts: verifiedArtifacts,
  };
}

export function buildNodeKitEvidenceIndex(verification) {
  return {
    schemaVersion: EVIDENCE_INDEX_SCHEMA,
    changeId: verification.manifest.nodekitChangeId,
    evidence: verification.artifacts.map((artifact) => {
      const independentlyVerified = artifact.sourceTruth.workflowVerification !== "unverified";
      const boundary = independentlyVerified
        ? `${artifact.sourceTruth.workflowVerification} ${artifact.verificationReceipt.schemaVersion}`
        : "no committed independent workflow receipt";
      return {
        id: `featureclip-${artifact.id}`,
        kind: artifact.artifactKind === "clip" ? "presentation-clip" : "presentation-screenshot",
        status: independentlyVerified ? "verified" : "observed",
        location: `repo://${verification.manifest.repository}/${artifact.path}?sha256=${artifact.sha256}`,
        summary: `${artifact.title}: repository bytes, media signature, dimensions, and Git tracking match the manifest. Source truth is ${artifact.sourceTruth.representation} in ${artifact.sourceTruth.captureEnvironment}; ${boundary}.`,
      };
    }),
  };
}

export function buildEvidenceReceipt(verification, projection, projectionPath = DEFAULT_PROJECTION) {
  const independentWorkflowReceipts = verification.artifacts.filter(
    (artifact) => artifact.sourceTruth.workflowVerification !== "unverified",
  ).length;
  const generatedIllustrations = verification.artifacts.filter(
    (artifact) => artifact.sourceTruth.representation === "generated-illustration",
  ).length;
  return {
    schemaVersion: RECEIPT_SCHEMA,
    collectionId: verification.manifest.collectionId,
    manifest: {
      path: verification.manifestPath,
      digestMode: "canonical-json-sha256",
      sha256: verification.manifestSha256,
      schemaVersion: MANIFEST_SCHEMA,
    },
    projection: {
      path: projectionPath,
      digestMode: "canonical-json-sha256",
      sha256: canonicalJsonSha256(projection),
      schemaVersion: EVIDENCE_INDEX_SCHEMA,
      changeId: projection.changeId,
    },
    checks: {
      passed: true,
      pathSafety: "passed",
      duplicateIds: "none",
      duplicatePaths: "none",
      artifactsDeclared: verification.artifacts.length,
      artifactBytesVerified: verification.artifacts.length,
      metadataMatched: verification.artifacts.length,
      gitTracked: verification.artifacts.filter((artifact) => artifact.gitTracked).length,
      independentWorkflowReceipts,
      generatedIllustrations,
    },
    artifacts: verification.artifacts.map((artifact) => ({
      id: artifact.id,
      path: artifact.path,
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      mediaType: artifact.mediaType,
      dimensions: artifact.dimensions,
      representation: artifact.sourceTruth.representation,
      captureEnvironment: artifact.sourceTruth.captureEnvironment,
      artifactVerification: artifact.sourceTruth.artifactVerification,
      workflowVerification: artifact.sourceTruth.workflowVerification,
      basis: artifact.basis,
      metadataMatched: artifact.metadataMatched,
    })),
    claimBoundary: {
      releaseReady: false,
      productWorkflowProof: independentWorkflowReceipts === verification.artifacts.length ? "receipt-referenced" : "not-certified",
      statement: "This receipt certifies repository containment, Git tracking, media signatures, dimensions, byte sizes, digests, and explicit source-truth labels. It does not certify production freshness, depicted workflow correctness, judge quality, or release readiness unless an artifact separately references an independent receipt.",
    },
  };
}

function writeAtomic(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, contents, { flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function compareCommitted(path, expected, label) {
  let actual;
  try {
    actual = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail(`${label} is missing or invalid JSON; run npm run evidence:project`);
  }
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(`${label} is stale; run npm run evidence:project`);
}

function parseArgs(argv) {
  const result = { command: argv[0] ?? "check", write: false, manifest: DEFAULT_MANIFEST };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") result.write = true;
    else if (arg === "--manifest") result.manifest = argv[++index];
    else fail(`unknown argument ${arg}`);
  }
  return result;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  if (args.command === "doctor") {
    const major = Number.parseInt(process.versions.node.split(".")[0], 10);
    if (major < 20) fail("Node 20 or newer is required");
    const verification = verifyEvidenceManifest(root, args.manifest);
    process.stdout.write(prettyJson({
      schemaVersion: "featureclip.evidence-doctor/v1",
      passed: true,
      node: process.versions.node,
      manifest: verification.manifestPath,
      artifacts: verification.artifacts.length,
      networkRequired: false,
      modelKeyRequired: false,
    }));
    return;
  }

  const verification = verifyEvidenceManifest(root, args.manifest);
  const projection = buildNodeKitEvidenceIndex(verification);
  const receipt = buildEvidenceReceipt(verification, projection);
  if (args.command === "check") {
    process.stdout.write(prettyJson({
      schemaVersion: "featureclip.evidence-check/v1",
      passed: true,
      collectionId: verification.manifest.collectionId,
      artifacts: verification.artifacts.length,
      manifestSha256: verification.manifestSha256,
    }));
    return;
  }
  if (args.command === "project") {
    if (!args.write) fail("project requires --write so output changes are explicit");
    writeAtomic(resolve(root, DEFAULT_PROJECTION), prettyJson(projection));
    writeAtomic(resolve(root, DEFAULT_RECEIPT), prettyJson(receipt));
    process.stdout.write(prettyJson({
      schemaVersion: "featureclip.evidence-project/v1",
      passed: true,
      projection: DEFAULT_PROJECTION,
      receipt: DEFAULT_RECEIPT,
      evidence: projection.evidence.length,
    }));
    return;
  }
  if (args.command === "proof") {
    compareCommitted(resolve(root, DEFAULT_PROJECTION), projection, "NodeKit Evidence Index projection");
    compareCommitted(resolve(root, DEFAULT_RECEIPT), receipt, "FeatureClip evidence receipt");
    process.stdout.write(prettyJson({
      schemaVersion: "featureclip.evidence-proof/v1",
      passed: true,
      releaseReady: false,
      artifacts: verification.artifacts.length,
      independentWorkflowReceipts: receipt.checks.independentWorkflowReceipts,
      boundary: receipt.claimBoundary.statement,
    }));
    return;
  }
  fail(`unknown command ${args.command}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.name ?? "Error"}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
