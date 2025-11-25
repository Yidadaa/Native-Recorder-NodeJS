import { join } from "path";

const addonPath = join(
  __dirname,
  "..",
  "build",
  "Release",
  "NativeAudioSDK.node"
);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bindings = require(addonPath);

export default bindings;
