import { join, dirname } from "path";
import { existsSync } from "fs";

function getBinding() {
  const moduleName = "NativeAudioSDK.node";

  // Try prebuild first (installed via npm)
  const prebuildsDir = join(__dirname, "..", "prebuilds");
  const platform = process.platform;
  const arch = process.arch;

  // prebuild-install stores binaries in: prebuilds/{platform}-{arch}/
  const prebuildPath = join(prebuildsDir, `${platform}-${arch}`, moduleName);

  if (existsSync(prebuildPath)) {
    return require(prebuildPath);
  }

  // Fallback to local build (development)
  const localPath = join(__dirname, "..", "build", "Release", moduleName);
  if (existsSync(localPath)) {
    return require(localPath);
  }

  // Final fallback for different build configurations
  const debugPath = join(__dirname, "..", "build", "Debug", moduleName);
  if (existsSync(debugPath)) {
    return require(debugPath);
  }

  throw new Error(
    `Could not find native module ${moduleName}. ` +
      `Tried:\n  - ${prebuildPath}\n  - ${localPath}\n  - ${debugPath}\n` +
      `Please run 'npm run build:native' or reinstall the package.`
  );
}

const bindings = getBinding();
export default bindings;
