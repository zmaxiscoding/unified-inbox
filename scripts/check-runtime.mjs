#!/usr/bin/env node

const requiredNodeMajor = 20;
const actualNodeVersion = process.versions.node;
const actualNodeMajor = Number.parseInt(actualNodeVersion.split(".")[0] ?? "", 10);

if (process.env.ALLOW_UNSUPPORTED_NODE === "1") {
  process.exit(0);
}

if (Number.isNaN(actualNodeMajor) || actualNodeMajor !== requiredNodeMajor) {
  console.error(
    `Unsupported Node.js version: ${actualNodeVersion}. Required major version: ${requiredNodeMajor}.`,
  );
  console.error("Use Node 20.x before running workspace scripts.");
  process.exit(1);
}
