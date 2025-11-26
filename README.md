# Native Recorder for Node.js

[![Build and Release](https://github.com/Yidadaa/Native-Recorder-NodeJS/actions/workflows/build.yml/badge.svg)](https://github.com/Yidadaa/Native-Recorder-NodeJS/actions/workflows/build.yml)
[![npm version](https://badge.fury.io/js/native-recorder-nodejs.svg)](https://www.npmjs.com/package/native-recorder-nodejs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

High-performance, low-latency native audio recording SDK for Node.js. Supports both **microphone input** and **system audio capture (loopback)** on Windows and macOS.

## Features

- **Microphone Recording** - Capture audio from any input device
- **System Audio Capture** - Record what's playing on your computer (loopback)
- **Cross-Platform** - Windows (WASAPI) and macOS (AVFoundation + ScreenCaptureKit)
- **High Performance** - Native C++ implementation with minimal latency
- **Prebuilt Binaries** - No compilation required for most platforms
- **Type Safe** - Full TypeScript support

## Platform Support

| Platform      | Architecture | Input (Mic) | Output (System Audio)   |
| ------------- | ------------ | ----------- | ----------------------- |
| Windows 10/11 | x64          | Supported   | Supported (per-device)  |
| Windows 10/11 | ia32         | Supported   | Supported (per-device)  |
| macOS 12.3+   | arm64        | Supported   | Supported (system-wide) |
| macOS 12.3+   | x64          | Supported   | Supported (system-wide) |

### Platform Differences

| Feature        | Windows               | macOS                          |
| -------------- | --------------------- | ------------------------------ |
| Input Devices  | Multiple (WASAPI)     | Multiple (AVFoundation)        |
| Output Devices | Multiple (per-device) | Single "System Audio" device   |
| Permissions    | None required         | Microphone + Screen Recording  |
| Min OS Version | Windows 10+           | macOS 12.3+ (for system audio) |

## Installation

```bash
npm install native-recorder-nodejs
```

Prebuilt binaries are available for most platforms. If a prebuild is not available, the package will compile from source (requires CMake and a C++ compiler).

## Quick Start

```typescript
import { AudioRecorder, SYSTEM_AUDIO_DEVICE_ID } from 'native-recorder-nodejs';
import * as fs from 'fs';

const recorder = new AudioRecorder();

// List available devices
const inputs = AudioRecorder.getDevices('input');
const outputs = AudioRecorder.getDevices('output');

console.log('Microphones:', inputs);
console.log('Output devices:', outputs);

// Record from default microphone
const mic = inputs.find(d => d.isDefault);
if (mic) {
  const output = fs.createWriteStream('recording.raw');
  
  recorder.on('data', (buffer) => {
    output.write(buffer);
  });
  
  recorder.on('error', (error) => {
    console.error('Recording error:', error);
  });
  
  await recorder.start({
    deviceType: 'input',
    deviceId: mic.id
  });
  
  // Record for 5 seconds
  setTimeout(async () => {
    await recorder.stop();
    output.end();
    console.log('Recording saved!');
  }, 5000);
}
```

### Record System Audio

```typescript
// Get system audio device
const outputs = AudioRecorder.getDevices('output');
const systemAudio = outputs.find(d => d.id === SYSTEM_AUDIO_DEVICE_ID) 
                 || outputs.find(d => d.isDefault);

if (systemAudio) {
  await recorder.start({
    deviceType: 'output',
    deviceId: systemAudio.id
  });
}
```

## API Reference

### `AudioRecorder`

The main class for controlling audio recording.

#### Constructor

```typescript
const recorder = new AudioRecorder();
```

#### Instance Methods

##### `start(config: RecordingConfig): Promise<void>`

Starts recording from the specified device.

```typescript
interface RecordingConfig {
  deviceType: 'input' | 'output';  // Required
  deviceId: string;                 // Required
}

await recorder.start({
  deviceType: 'input',
  deviceId: 'device-uuid'
});
```

##### `stop(): Promise<void>`

Stops the recording session.

```typescript
await recorder.stop();
```

#### Static Methods

##### `getDevices(type?: DeviceType): AudioDevice[]`

Lists available audio devices.

```typescript
interface AudioDevice {
  id: string;           // Unique identifier
  name: string;         // Human-readable name
  type: 'input' | 'output';
  isDefault: boolean;
}

const allDevices = AudioRecorder.getDevices();
const microphones = AudioRecorder.getDevices('input');
const outputs = AudioRecorder.getDevices('output');
```

##### `getDeviceFormat(deviceId: string): AudioFormat`

Gets the audio format of a device.

```typescript
interface AudioFormat {
  sampleRate: number;   // e.g., 48000
  channels: number;     // 1 (mono) or 2 (stereo)
  bitDepth: number;     // Output bit depth (16)
  rawBitDepth: number;  // Native device bit depth
}

const format = AudioRecorder.getDeviceFormat(device.id);
```

##### `checkPermission(): PermissionStatus`

Checks current permission status.

```typescript
interface PermissionStatus {
  mic: boolean;     // Microphone permission
  system: boolean;  // System audio permission
}

const status = AudioRecorder.checkPermission();
```

##### `requestPermission(type: 'mic' | 'system'): boolean`

Requests permission for recording.

```typescript
const granted = AudioRecorder.requestPermission('mic');
const systemGranted = AudioRecorder.requestPermission('system');
```

#### Events

##### `'data'`

Emitted when audio data is available.

```typescript
recorder.on('data', (buffer: Buffer) => {
  // Raw PCM 16-bit LE audio data
});
```

##### `'error'`

Emitted when an error occurs.

```typescript
recorder.on('error', (error: Error) => {
  console.error(error.message);
});
```

### Constants

```typescript
// Special device ID for system-wide audio capture on macOS
export const SYSTEM_AUDIO_DEVICE_ID = 'system';
```

## Audio Format

The output is always:
- **Format**: Raw PCM
- **Bit Depth**: 16-bit signed integer
- **Endianness**: Little Endian
- **Sample Rate**: 48kHz on macOS (fixed), native device rate on Windows (commonly 44.1kHz or 48kHz)
- **Channels**: Stereo on macOS (fixed), preserved from source on Windows

### Playing Raw Audio

You can play the recorded raw audio using FFplay:

```bash
ffplay -f s16le -ar 48000 -ch_layout stereo recording.raw
```

Or convert to WAV using FFmpeg:

```bash
ffmpeg -f s16le -ar 48000 -ac 2 -i recording.raw output.wav
```

## Permissions (macOS)

On macOS, you need to grant permissions:

1. **Microphone** - Required for input device recording
2. **Screen Recording** - Required for system audio capture

The SDK will automatically prompt for permissions when needed, or you can request them programmatically:

```typescript
const permissions = AudioRecorder.checkPermission();

if (!permissions.mic) {
  AudioRecorder.requestPermission('mic');
}

if (!permissions.system) {
  AudioRecorder.requestPermission('system');
}
```

## Error Handling

| Error Code             | Description                                |
| ---------------------- | ------------------------------------------ |
| `DEVICE_NOT_FOUND`     | Specified device ID does not exist         |
| `DEVICE_TYPE_MISMATCH` | Device ID doesn't match the specified type |
| `PERMISSION_DENIED`    | Missing required system permission         |
| `ALREADY_RECORDING`    | Recording session already active           |
| `DEVICE_DISCONNECTED`  | Device was disconnected during recording   |

## Building from Source

### Prerequisites

- Node.js 16+
- CMake 3.15+
- C++17 compiler
  - Windows: Visual Studio 2019+ or MSVC Build Tools
  - macOS: Xcode Command Line Tools

### Build Commands

```bash
# Install dependencies
npm install

# Build native module
npm run build:native

# Build TypeScript
npm run build:ts

# Build everything
npm run build

# Run tests
npm test
```

### Publishing

```bash
# Build prebuilt binaries for current platform
npm run prebuild

# Upload prebuilts to GitHub Release (requires GITHUB_TOKEN)
npm run prebuild:upload

# Publish to npm (prebuilts should be uploaded first)
npm publish
```

### CI/CD with GitHub Actions

The project uses GitHub Actions for automated builds and releases. The workflow is triggered by:

| Trigger                        | Action                                                 |
| ------------------------------ | ------------------------------------------------------ |
| Push to `main`                 | Build and test on all platforms                        |
| Pull Request to `main`         | Build and test on all platforms                        |
| Push tag `v*` (e.g., `v1.0.0`) | Build, test, publish to npm, and create GitHub Release |

**To release a new version:**

```bash
# 1. Update version in package.json
npm version patch  # or minor, major

# 2. Push the tag to trigger the release workflow
git push origin main --tags
```

The CI will automatically:
1. Build native modules for all platforms (macOS arm64/x64, Windows x64/ia32)
2. Run tests on each platform
3. Publish the package to npm with prebuilt binaries
4. Create a GitHub Release with the native binaries attached

> **Note**: Ensure `NPM_TOKEN` is configured in repository secrets for npm publishing.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Node.js Application                 │
├─────────────────────────────────────────────────┤
│              TypeScript Wrapper                  │
├─────────────────────────────────────────────────┤
│              N-API Binding Layer                 │
├────────────────────┬────────────────────────────┤
│   Windows          │         macOS              │
│   (WASAPI)         │   (AVFoundation +          │
│                    │    ScreenCaptureKit)       │
└────────────────────┴────────────────────────────┘
```

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md).

For complete API documentation, see [docs/api.md](docs/api.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [node-addon-api](https://github.com/nodejs/node-addon-api) - N-API C++ wrapper
- [cmake-js](https://github.com/nicknisi/cmake-js) - CMake build system for Node.js addons
