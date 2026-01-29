#!/usr/bin/env node
/**
 * Build native module for Electron
 * Usage: node scripts/build_electron.js -v <version>
 * Example: node scripts/build_electron.js -v 40.0.0
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const PLATFORM = process.platform;

// Parse arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let version = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-v" || args[i] === "--version") {
      version = args[i + 1];
      i++;
    }
  }

  return { version };
}

function main() {
  const { version } = parseArgs();

  if (!version) {
    console.error("Error: Electron version is required");
    console.error("Usage: pnpm build:electron -v <version>");
    console.error("Example: pnpm build:electron -v 40.0.0");
    process.exit(1);
  }

  const majorVersion = version.split(".")[0];
  console.log(`Building for Electron v${version} (major: ${majorVersion})`);

  // Clean CMake cache to avoid conflicts with previous builds
  const buildDir = path.join(__dirname, "..", "build");
  const cmakeCachePath = path.join(buildDir, "CMakeCache.txt");
  if (fs.existsSync(cmakeCachePath)) {
    console.log("Cleaning CMake cache...");
    fs.unlinkSync(cmakeCachePath);
  }

  // Copy Electron's node.lib to build directory on Windows
  if (PLATFORM === "win32") {
    const electronLibPath = path.join(
      __dirname,
      "..",
      "lib",
      `electron-v${majorVersion}`,
      "node.lib"
    );
    const destLibPath = path.join(buildDir, "node.lib");

    if (!fs.existsSync(electronLibPath)) {
      console.error(`Error: node.lib not found at ${electronLibPath}`);
      console.error("Please prepare the Electron node.lib first");
      process.exit(1);
    }

    // Create build directory if it doesn't exist
    if (!fs.existsSync(buildDir)) {
      fs.mkdirSync(buildDir, { recursive: true });
    }

    // Copy node.lib to build directory
    console.log(`Copying ${electronLibPath} -> ${destLibPath}`);
    fs.copyFileSync(electronLibPath, destLibPath);
  }

  // Build command
  const cmd = `npx cmake-js compile --runtime=electron --runtime-version=${version}`;

  console.log(`Running: ${cmd}`);

  try {
    execSync(cmd, {
      stdio: "inherit",
      cwd: path.join(__dirname, ".."),
    });
    console.log(`\nSuccessfully built for Electron v${version}`);
  } catch (error) {
    console.error(`\nBuild failed for Electron v${version}`);
    process.exit(1);
  }
}

main();
