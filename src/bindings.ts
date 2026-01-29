import { join, dirname } from "path";
import { existsSync } from "fs";

/**
 * Detect if running in Electron environment
 */
function isElectron(): boolean {
  // Check for Electron-specific process properties
  if (typeof process !== "undefined") {
    // @ts-ignore
    if (process.versions && process.versions.electron) {
      return true;
    }
    // Check for Electron renderer process
    if (
      typeof globalThis !== "undefined" &&
      // @ts-ignore
      globalThis.window &&
      // @ts-ignore
      globalThis.window.process &&
      // @ts-ignore
      globalThis.window.process.type === "renderer"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Get Electron major version for prebuild lookup
 */
function getElectronMajorVersion(): string | null {
  try {
    // @ts-ignore
    const electronVersion = process.versions.electron;
    if (!electronVersion) return null;

    const majorVersion = parseInt(electronVersion.split(".")[0], 10);
    return `electron-v${majorVersion}`;
  } catch {
    return null;
  }
}

function getBinding() {
  const moduleName = "NativeAudioSDK.node";

  // Try prebuild first (installed via npm)
  const prebuildsDir = join(__dirname, "..", "prebuilds");
  const platform = process.platform;
  const arch = process.arch;

  const paths: string[] = [];

  // For Electron, try Electron-specific prebuild first
  if (isElectron()) {
    const electronVersion = getElectronMajorVersion();
    if (electronVersion) {
      const electronPrebuildPath = join(
        prebuildsDir,
        `${platform}-${arch}`,
        electronVersion,
        moduleName,
      );
      paths.push(electronPrebuildPath);
      if (existsSync(electronPrebuildPath)) {
        return require(electronPrebuildPath);
      }
    }
  }

  // Try N-API prebuild (works for both Node.js and Electron with N-API support)
  // prebuild-install stores binaries in: prebuilds/{platform}-{arch}/
  const prebuildPath = join(prebuildsDir, `${platform}-${arch}`, moduleName);
  paths.push(prebuildPath);

  if (existsSync(prebuildPath)) {
    return require(prebuildPath);
  }

  // Also try napi-v8 subfolder format
  const napiPrebuildPath = join(
    prebuildsDir,
    `${platform}-${arch}`,
    "napi-v8",
    moduleName,
  );
  paths.push(napiPrebuildPath);

  if (existsSync(napiPrebuildPath)) {
    return require(napiPrebuildPath);
  }

  // Fallback to local build (development)
  const localPath = join(__dirname, "..", "build", "Release", moduleName);
  paths.push(localPath);
  if (existsSync(localPath)) {
    return require(localPath);
  }

  // Final fallback for different build configurations
  const debugPath = join(__dirname, "..", "build", "Debug", moduleName);
  paths.push(debugPath);
  if (existsSync(debugPath)) {
    return require(debugPath);
  }

  const runtime = isElectron() ? "Electron" : "Node.js";
  throw new Error(
    `Could not find native module ${moduleName} for ${runtime}. ` +
      `Tried:\n  - ${paths.join("\n  - ")}\n` +
      `Please run 'npm run build:native' or reinstall the package.\n` +
      `For Electron users: try running 'npx electron-rebuild' in your project.`,
  );
}

const bindings = getBinding();
export default bindings;
