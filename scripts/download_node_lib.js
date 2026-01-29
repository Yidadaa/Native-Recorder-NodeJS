#!/usr/bin/env node
/**
 * Download prebuilt node.lib for Windows builds
 * This script downloads the appropriate node.lib file from nodejs.org
 * and Electron's node.lib from electronjs.org to enable native module compilation on Windows.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const NODE_VERSION = process.version.replace("v", "");
const ARCH = process.arch; // x64, ia32, arm64
const PLATFORM = process.platform;

// Electron versions to download (matching CI configuration)
const ELECTRON_VERSIONS = [
  "29.0.0",
  "30.0.0",
  "31.0.0",
  "32.0.0",
  "33.0.0",
  "34.0.0",
  "35.0.0",
  "36.0.0",
  "37.0.0",
  "38.0.0",
  "39.0.0",
  "40.0.0",
];

// Only needed for Windows
if (PLATFORM !== "win32") {
  console.log("Skipping node.lib download (not Windows)");
  process.exit(0);
}

const BUILD_DIR = path.join(__dirname, "..", "lib");
const NODE_LIB_PATH = path.join(BUILD_DIR, "node.lib");
const NODE_LIB_URL = `https://nodejs.org/dist/v${NODE_VERSION}/win-${ARCH}/node.lib`;

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    const request = https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers["content-length"], 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
        downloadedSize += chunk.length;
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      fs.unlink(dest, () => { }); // Delete the file on error
      reject(err);
    });

    file.on("error", (err) => {
      file.close();
      fs.unlink(dest, () => { }); // Delete the file on error
      reject(err);
    });
  });
}

async function main() {
  console.log(`Node.js version: v${NODE_VERSION}`);
  console.log(`Architecture: ${ARCH}`);
  console.log(`Platform: ${PLATFORM}`);

  // Create build directory if it doesn't exist
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    console.log(`Created directory: ${BUILD_DIR}`);
  }

  const forceDownload = process.argv.includes("--force");

  // Download Node.js node.lib
  console.log("\n=== Downloading Node.js node.lib ===");
  await downloadIfNeeded(NODE_LIB_URL, NODE_LIB_PATH, forceDownload);

  // Download Electron node.lib for each version
  console.log("\n=== Downloading Electron node.lib ===");
  for (const electronVersion of ELECTRON_VERSIONS) {
    const majorVersion = electronVersion.split(".")[0];
    const electronDir = path.join(BUILD_DIR, `electron-v${majorVersion}`);
    const electronLibPath = path.join(electronDir, "node.lib");
    const electronLibUrl = `https://electronjs.org/headers/v${electronVersion}/win-${ARCH}/node.lib`;

    // Create electron version directory
    if (!fs.existsSync(electronDir)) {
      fs.mkdirSync(electronDir, { recursive: true });
    }

    console.log(`\nElectron v${majorVersion}:`);
    await downloadIfNeeded(electronLibUrl, electronLibPath, forceDownload);
  }

  console.log("\n=== All downloads complete! ===");
}

async function downloadIfNeeded(url, destPath, force) {
  if (fs.existsSync(destPath)) {
    const stats = fs.statSync(destPath);
    console.log(`  Already exists (${(stats.size / 1024).toFixed(1)} KB)`);

    if (!force) {
      return;
    }
    console.log("  Force re-downloading...");
  }

  try {
    await downloadFile(url, destPath);
    const stats = fs.statSync(destPath);
    console.log(`  Downloaded (${(stats.size / 1024).toFixed(1)} KB)`);
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    throw error;
  }
}

main();
