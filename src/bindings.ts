import { join, dirname } from "path";
import { existsSync, readdirSync } from "fs";

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
 * Get Electron major version number
 */
function getElectronMajorVersion(): number | null {
  try {
    // @ts-ignore
    const electronVersion = process.versions.electron;
    if (!electronVersion) return null;

    return parseInt(electronVersion.split(".")[0], 10);
  } catch {
    return null;
  }
}

/**
 * Find available Electron prebuild versions in the prebuilds directory
 */
function findAvailableElectronVersions(platformDir: string): number[] {
  try {
    if (!existsSync(platformDir)) return [];

    const dirs = readdirSync(platformDir, { withFileTypes: true });
    const versions: number[] = [];

    for (const dir of dirs) {
      if (dir.isDirectory() && dir.name.startsWith("electron-v")) {
        const version = parseInt(dir.name.replace("electron-v", ""), 10);
        if (!isNaN(version)) {
          versions.push(version);
        }
      }
    }

    return versions.sort((a, b) => b - a); // Sort descending (newest first)
  } catch {
    return [];
  }
}

/**
 * Find the closest available Electron prebuild version
 * Prefers newer versions that are closest to the target
 */
function findClosestElectronVersion(
  targetVersion: number,
  availableVersions: number[],
): number | null {
  if (availableVersions.length === 0) return null;

  // First, try to find an exact match
  if (availableVersions.includes(targetVersion)) {
    return targetVersion;
  }

  // Find the closest version (prefer slightly older over much newer for stability)
  let closest: number | null = null;
  let minDiff = Infinity;

  for (const version of availableVersions) {
    const diff = Math.abs(version - targetVersion);
    // Prefer older versions when diff is the same (more stable)
    if (diff < minDiff || (diff === minDiff && version < targetVersion)) {
      minDiff = diff;
      closest = version;
    }
  }

  return closest;
}

function getBinding() {
  const moduleName = "NativeAudioSDK.node";

  // Try prebuild first (installed via npm)
  const prebuildsDir = join(__dirname, "..", "prebuilds");
  const platform = process.platform;
  const arch = process.arch;
  const platformDir = join(prebuildsDir, `${platform}-${arch}`);

  const paths: string[] = [];

  // For Electron, try Electron-specific prebuild first
  if (isElectron()) {
    const electronMajor = getElectronMajorVersion();
    if (electronMajor) {
      // Try exact version match first
      const exactPath = join(
        platformDir,
        `electron-v${electronMajor}`,
        moduleName,
      );
      paths.push(exactPath);
      if (existsSync(exactPath)) {
        return require(exactPath);
      }

      // Fallback: find closest available Electron version
      const availableVersions = findAvailableElectronVersions(platformDir);
      const closestVersion = findClosestElectronVersion(
        electronMajor,
        availableVersions,
      );

      if (closestVersion && closestVersion !== electronMajor) {
        const fallbackPath = join(
          platformDir,
          `electron-v${closestVersion}`,
          moduleName,
        );
        paths.push(fallbackPath);
        if (existsSync(fallbackPath)) {
          console.warn(
            `[native-recorder-nodejs] No prebuild for Electron ${electronMajor}, ` +
              `using Electron ${closestVersion} prebuild as fallback. ` +
              `Consider running 'npx electron-rebuild' for best compatibility.`,
          );
          return require(fallbackPath);
        }
      }
    }
  }

  // Try N-API prebuild (works for both Node.js and Electron with N-API support)
  // Since this module uses N-API, the Node.js prebuild should work in Electron too
  // prebuild-install stores binaries in: prebuilds/{platform}-{arch}/
  const prebuildPath = join(platformDir, moduleName);
  paths.push(prebuildPath);

  if (existsSync(prebuildPath)) {
    return require(prebuildPath);
  }

  // Also try napi-v8 subfolder format
  const napiPrebuildPath = join(platformDir, "napi-v8", moduleName);
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
