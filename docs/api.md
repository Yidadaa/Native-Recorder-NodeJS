# API Documentation

## Overview

Native Audio SDK provides audio recording capabilities with a unified interface across Windows and macOS. The API distinguishes between two types of audio devices:

- **Input Devices**: Microphones and other audio input hardware
- **Output Devices**: System audio capture (loopback recording)

### Platform Differences

| Platform | Input Devices                            | Output Devices                                                    |
| -------- | ---------------------------------------- | ----------------------------------------------------------------- |
| Windows  | Multiple microphone devices (unique IDs) | Multiple speaker/output devices (unique IDs, via WASAPI loopback) |
| macOS    | Multiple microphone devices (unique IDs) | Single "System Audio" device (ID: `system`, via ScreenCaptureKit) |

### Device ID Convention

All devices have a valid `id` field:
- **Physical devices**: Platform-specific unique identifier (UUID)
- **System Audio (macOS)**: Constant value `"system"`

## TypeScript Interface

### Constants

```typescript
/**
 * Special device ID for system-wide audio capture on macOS
 */
export const SYSTEM_AUDIO_DEVICE_ID = 'system';
```

### Types

```typescript
/**
 * Device type classification
 */
export type DeviceType = 'input' | 'output';

/**
 * Represents an audio device
 */
export interface AudioDevice {
  /** Unique device identifier (always has a value) */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Device type: 'input' for microphones, 'output' for system audio */
  type: DeviceType;
  /** Whether this is the default device for its type */
  isDefault: boolean;
}

/**
 * Audio format information
 */
export interface AudioFormat {
  /** Sample rate in Hz (e.g., 44100, 48000) */
  sampleRate: number;
  /** Number of channels (1 = Mono, 2 = Stereo) */
  channels: number;
  /** Output bit depth (currently fixed at 16) */
  bitDepth: number;
  /** Native device bit depth */
  rawBitDepth: number;
}

/**
 * Recording configuration
 * Both deviceType and deviceId are required for consistent cross-platform behavior
 */
export interface RecordingConfig {
  /**
   * Type of device to record from.
   * - 'input': Record from microphone
   * - 'output': Record system audio (loopback)
   */
  deviceType: DeviceType;
  
  /**
   * Device ID to record from (obtained from getDevices()).
   * Every device has a valid ID - use the ID from the device list.
   */
  deviceId: string;
}
```

### Class: `AudioRecorder`

The main class for controlling audio recording.

#### Constructor
```typescript
constructor()
```

Creates a new AudioRecorder instance.

#### Instance Methods

##### `start(config: RecordingConfig): Promise<void>`
Starts the recording session.

```typescript
// Step 1: Get available devices
const inputDevices = AudioRecorder.getDevices('input');
const outputDevices = AudioRecorder.getDevices('output');

// Step 2: Select a device (e.g., default microphone)
const defaultMic = inputDevices.find(d => d.isDefault);

// Step 3: Start recording with both deviceType and deviceId
await recorder.start({ 
  deviceType: 'input', 
  deviceId: defaultMic.id 
});

// Example: Record from specific microphone
await recorder.start({ 
  deviceType: 'input', 
  deviceId: 'some-mic-uuid' 
});

// Example: Record system audio (macOS)
await recorder.start({ 
  deviceType: 'output', 
  deviceId: SYSTEM_AUDIO_DEVICE_ID  // 'system'
});

// Example: Record from specific speaker (Windows)
const speaker = outputDevices.find(d => d.name.includes('Speaker'));
await recorder.start({ 
  deviceType: 'output', 
  deviceId: speaker.id 
});
```

- **config**: Configuration object with `deviceType` and `deviceId` (both required)
- **Returns**: Promise that resolves when recording has started
- **Throws**: Error if device not found, permission denied, or type/id mismatch

##### `stop(): Promise<void>`
Stops the recording session and releases resources.

```typescript
await recorder.stop();
```

#### Static Methods

##### `getDevices(type?: DeviceType): AudioDevice[]`
Lists available audio devices.

```typescript
// Get all devices
const allDevices = AudioRecorder.getDevices();

// Get only input devices (microphones)
const microphones = AudioRecorder.getDevices('input');

// Get only output devices (speakers/system audio)
const outputs = AudioRecorder.getDevices('output');

// Example output on macOS:
// [
//   { id: 'BuiltInMic-xxx', name: 'MacBook Pro Microphone', type: 'input', isDefault: true },
//   { id: 'USBMic-xxx', name: 'Blue Yeti', type: 'input', isDefault: false },
//   { id: 'system', name: 'System Audio', type: 'output', isDefault: true }
// ]

// Example output on Windows:
// [
//   { id: '{mic-guid}', name: 'Microphone (Realtek)', type: 'input', isDefault: true },
//   { id: '{speaker-guid}', name: 'Speakers (Realtek)', type: 'output', isDefault: true },
//   { id: '{headphone-guid}', name: 'Headphones', type: 'output', isDefault: false }
// ]
```

- **type**: Optional filter by device type
- **Returns**: Array of `AudioDevice` objects (all with valid `id` values)

##### `getDeviceFormat(deviceId: string): AudioFormat`
Gets the audio format of a specific device.

```typescript
const format = AudioRecorder.getDeviceFormat('device-uuid');
console.log(`${format.sampleRate}Hz, ${format.channels}ch, ${format.bitDepth}bit`);
```

- **deviceId**: The device ID to query
- **Returns**: `AudioFormat` object

#### Events

##### `'data'`
Emitted when a new chunk of audio data is available.

```typescript
recorder.on('data', (data: Buffer) => {
  // data is raw PCM 16-bit LE audio
  // Use getDeviceFormat() to determine sample rate and channels
});
```

##### `'error'`
Emitted when an error occurs during recording.

```typescript
recorder.on('error', (error: Error) => {
  console.error('Recording error:', error.message);
});
```

---

## C++ / N-API Interface

### Constants

```cpp
// Special device ID for system-wide audio capture (macOS)
static constexpr const char* SYSTEM_AUDIO_DEVICE_ID = "system";
```

### Exported Class: `AudioController`

| JS Method                   | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `start(config, callback)`   | Start recording with config object and data callback |
| `stop()`                    | Stop recording                                       |
| `getDevices()`              | Static. Returns array of all audio devices           |
| `getDeviceFormat(deviceId)` | Static. Returns format info for a device             |

### Native C++ Interfaces

#### `AudioDevice` Structure
```cpp
struct AudioDevice {
  std::string id;      // Always has a value (UUID or "system")
  std::string name;    // Human-readable name
  std::string type;    // "input" or "output"
  bool isDefault;      // Default device for its type
};
```

#### `AudioFormat` Structure
```cpp
struct AudioFormat {
  int sampleRate;
  int channels;
  int bitDepth;      // Output bit depth (16)
  int rawBitDepth;   // Native device bit depth
};
```

#### `AudioEngine` (Abstract Base Class)
```cpp
class AudioEngine {
public:
  virtual ~AudioEngine() = default;
  
  using DataCallback = std::function<void(const uint8_t* data, size_t size)>;
  using ErrorCallback = std::function<void(const std::string& error)>;
  
  // Start recording from specified device
  // deviceType: "input" or "output"
  // deviceId: device identifier (from GetDevices, never empty)
  virtual void Start(const std::string& deviceType,
                     const std::string& deviceId,
                     DataCallback dataCb, 
                     ErrorCallback errorCb) = 0;
  
  virtual void Stop() = 0;
  
  // Get all available devices (both input and output)
  // All returned devices have valid id values
  virtual std::vector<AudioDevice> GetDevices() = 0;
  
  // Get format for specific device
  virtual AudioFormat GetDeviceFormat(const std::string& deviceId) = 0;
  
  // Special device ID for system-wide audio capture (macOS)
  static constexpr const char* SYSTEM_AUDIO_DEVICE_ID = "system";
};
```

---

## Platform-Specific Behavior

### Windows (WASAPI)

**Input Devices:**
- Enumerates all active capture devices (microphones)
- Each device has a unique GUID as `id`
- Uses standard WASAPI capture

**Output Devices:**
- Enumerates all active render devices (speakers/headphones)
- Each device has a unique GUID as `id`
- Uses WASAPI loopback mode to capture audio being played
- Each output device can be recorded individually

### macOS (AVFoundation + ScreenCaptureKit)

**Input Devices:**
- Enumerates all audio input devices via AVCaptureDevice
- Each device has a unique identifier as `id`
- Uses AVFoundation for capture

**Output Devices:**
- Returns single virtual device with `id: "system"`, `name: "System Audio"`
- Uses ScreenCaptureKit (requires macOS 12.3+)
- Captures all system audio output mixed together
- Requires screen recording permission

---

## Usage Pattern (Cross-Platform)

```typescript
import { AudioRecorder, SYSTEM_AUDIO_DEVICE_ID } from 'native-audio-sdk';

// Create recorder
const recorder = new AudioRecorder();

// Get devices
const inputs = AudioRecorder.getDevices('input');
const outputs = AudioRecorder.getDevices('output');

// Record from default microphone
const defaultMic = inputs.find(d => d.isDefault);
if (defaultMic) {
  await recorder.start({
    deviceType: 'input',
    deviceId: defaultMic.id
  });
}

// OR: Record system audio
const systemOutput = outputs.find(d => d.isDefault) 
                   || outputs.find(d => d.id === SYSTEM_AUDIO_DEVICE_ID);
if (systemOutput) {
  await recorder.start({
    deviceType: 'output',
    deviceId: systemOutput.id
  });
}

// Handle data
recorder.on('data', (buffer) => {
  // Process audio data
});

// Stop recording
await recorder.stop();
```

---

## Error Codes

| Error                   | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `DEVICE_NOT_FOUND`      | Specified device ID does not exist                |
| `DEVICE_TYPE_MISMATCH`  | Device ID does not match the specified deviceType |
| `PERMISSION_DENIED`     | Missing required system permission                |
| `ALREADY_RECORDING`     | Recording session already active                  |
| `UNSUPPORTED_OPERATION` | Operation not supported on this platform          |
| `DEVICE_DISCONNECTED`   | Device was disconnected during recording          |
