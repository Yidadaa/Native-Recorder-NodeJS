# API Documentation

## TypeScript Interface

### Types

```typescript
export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface AudioFormat {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  rawBitDepth: number;
}

export interface AudioConfig {
  /**
   * Device ID to record from.
   * If not provided, uses the default system device.
   */
  deviceId?: string;
  
  /**
   * Type of recording.
   * 'microphone': Record from input device.
   * 'system': Record system output (Loopback).
   * Default: 'microphone'
   */
  type?: 'microphone' | 'system';
}
```

### Class: `AudioRecorder`

The main class for controlling audio recording.

#### Constructor
```typescript
constructor()
```

#### Methods

##### `start(config?: AudioConfig): Promise<void>`
Starts the recording session.
- **config**: Optional configuration object.
- **Returns**: A Promise that resolves when recording has successfully started.
- **Throws**: Error if device not found or permission denied.

##### `stop(): Promise<void>`
Stops the recording session and releases resources.
- **Returns**: A Promise that resolves when recording has stopped.

##### `getDevices(): Promise<AudioDevice[]>`
Static method to list available audio input devices.
- **Returns**: A Promise resolving to an array of `AudioDevice` objects.

##### `getDeviceFormat(deviceId: string): Promise<AudioFormat>`
Static method to get the raw audio format of a specific device.
- **deviceId**: The ID of the device to query.
- **Returns**: A Promise resolving to an `AudioFormat` object containing:
  - `sampleRate`: The sample rate of the audio data (e.g., 44100, 48000).
  - `channels`: The number of channels (e.g., 1 for Mono, 2 for Stereo).
  - `bitDepth`: The bit depth of the output audio data (currently fixed at 16).
  - `rawBitDepth`: The native bit depth of the device hardware.

#### Events

##### `on('data', (data: Buffer) => void)`
Emitted when a new chunk of audio data is available.
- **data**: A Node.js Buffer containing raw PCM 16-bit LE audio.
  - **Note**: The sample rate and channel count depend on the device configuration. Use `getDeviceFormat(deviceId)` to determine these values.

##### `on('error', (error: Error) => void)`
Emitted when an error occurs during the recording session (e.g., device disconnected).

---

## C++ / N-API Interface

The native addon exports a class `AudioRecorderWrapper` that wraps the C++ `AudioController`.

### `AudioRecorderWrapper` (N-API ObjectWrap)

#### Constructor
`new AudioRecorderWrapper()`

#### Methods

| JS Method       | C++ Method                                   | Description                                                        |
| :-------------- | :------------------------------------------- | :----------------------------------------------------------------- |
| `start(config)` | `Start(const Napi::CallbackInfo& info)`      | Parses config, initializes `AudioEngine`, starts recording thread. |
| `stop()`        | `Stop(const Napi::CallbackInfo& info)`       | Signals stop to `AudioEngine`, waits for thread join.              |
| `getDevices()`  | `GetDevices(const Napi::CallbackInfo& info)` | Static. Returns array of device objects.                           |

### Native C++ Classes

#### `AudioEngine` (Abstract)
```cpp
class AudioEngine {
public:
    virtual ~AudioEngine() = default;
    virtual void Start(const std::string &deviceId, bool isLoopback, std::function<void(const uint8_t*, size_t)> dataCallback, std::function<void(std::string)> errorCallback) = 0;
    virtual void Stop() = 0;
    virtual std::vector<AudioDevice> GetDevices() = 0;
};
```
