import bindings from "./bindings";
import { EventEmitter } from "events";

/**
 * Special device ID for system-wide audio capture (macOS)
 */
export const SYSTEM_AUDIO_DEVICE_ID = "system";

/**
 * Device type classification
 */
export type DeviceType = "input" | "output";

/**
 * Permission type for requesting access
 */
export type PermissionType = "mic" | "system";

/**
 * Permission status for audio recording
 */
export interface PermissionStatus {
  /** Microphone permission granted */
  mic: boolean;
  /** System audio permission granted (screen recording permission on macOS) */
  system: boolean;
}

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

// Define the native controller interface
interface NativeAudioController {
  start(
    config: RecordingConfig,
    callback: (error: Error | null, data: Buffer | null) => void
  ): void;
  stop(): void;
}

// Define the native module interface
interface NativeModule {
  AudioController: {
    new (): NativeAudioController;
    getDevices(): AudioDevice[];
    getDeviceFormat(deviceId: string): AudioFormat;
    checkPermission(): PermissionStatus;
    requestPermission(type: PermissionType): boolean;
  };
}

const native = bindings as NativeModule;

export class AudioRecorder extends EventEmitter {
  private controller: NativeAudioController;
  private isRecording: boolean = false;

  constructor() {
    super();
    this.controller = new native.AudioController();
  }

  /**
   * Starts the recording session.
   * @param config Configuration object with deviceType and deviceId (both required)
   */
  async start(config: RecordingConfig): Promise<void> {
    if (this.isRecording) {
      throw new Error("Already recording");
    }

    // Validate config
    if (!config.deviceType || !config.deviceId) {
      throw new Error("Both deviceType and deviceId are required");
    }

    if (config.deviceType !== "input" && config.deviceType !== "output") {
      throw new Error("deviceType must be 'input' or 'output'");
    }

    return new Promise((resolve, reject) => {
      try {
        this.controller.start(
          config,
          (error: Error | null, data: Buffer | null) => {
            if (error) {
              this.emit("error", error);
            } else if (data) {
              this.emit("data", data);
            }
          }
        );
        this.isRecording = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.controller.stop();
        this.isRecording = false;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Lists available audio devices.
   * @param type Optional filter by device type
   * @returns Array of AudioDevice objects (all with valid id values)
   */
  static getDevices(type?: DeviceType): AudioDevice[] {
    const devices = native.AudioController.getDevices();
    if (type) {
      return devices.filter((d) => d.type === type);
    }
    return devices;
  }

  /**
   * Gets the audio format of a specific device.
   * @param deviceId The device ID to query
   * @returns AudioFormat object
   */
  static getDeviceFormat(deviceId: string): AudioFormat {
    return native.AudioController.getDeviceFormat(deviceId);
  }

  /**
   * Checks the current permission status for audio recording.
   * On Windows, always returns { mic: true, system: true } as no explicit permissions are required.
   * On macOS, checks actual permission status for microphone and screen recording.
   * @returns PermissionStatus object with mic and system boolean fields
   */
  static checkPermission(): PermissionStatus {
    return native.AudioController.checkPermission();
  }

  /**
   * Requests permission for the specified type.
   * On Windows, always returns true as no explicit permissions are required.
   * On macOS, prompts the user to grant the requested permission.
   * @param type The permission type to request: 'mic' for microphone, 'system' for system audio
   * @returns true if permission was granted, false otherwise
   */
  static requestPermission(type: PermissionType): boolean {
    return native.AudioController.requestPermission(type);
  }
}

// Export raw bindings for testing if needed
export const nativeBindings = bindings;
