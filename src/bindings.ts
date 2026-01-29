import { join } from "path";
import { existsSync } from "fs";

function getBinding() {
  const moduleName = "NativeAudioSDK.node";

  // Try prebuild first (installed via npm)
  const prebuildsDir = join(__dirname, "..", "prebuilds");
  const platform = process.platform;
  const arch = process.arch;
  const platformDir = join(prebuildsDir, `${platform}-${arch}`);

  const paths: string[] = [];

  // Try prebuild (works for both Node.js and Electron via N-API)
  const prebuildPath = join(platformDir, moduleName);
  paths.push(prebuildPath);

  if (existsSync(prebuildPath)) {
    return require(prebuildPath);
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

  throw new Error(
    `Could not find native module ${moduleName}. ` +
      `Tried:\n  - ${paths.join("\n  - ")}\n` +
      `Please run 'npm run build:native' or reinstall the package.`,
  );
}

const bindings = getBinding();
export default bindings;
