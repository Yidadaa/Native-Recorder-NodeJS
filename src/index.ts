import bindings from "./bindings";
import { EventEmitter } from "events";

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
  deviceId?: string;
  type?: "microphone" | "system";
}

// Define the native controller interface
interface NativeAudioController {
  start(
    config: AudioConfig,
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

  async start(config: AudioConfig = {}): Promise<void> {
    if (this.isRecording) {
      throw new Error("Already recording");
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

  static async getDevices(): Promise<AudioDevice[]> {
    return new Promise((resolve, reject) => {
      try {
        const devices = native.AudioController.getDevices();
        resolve(devices);
      } catch (error) {
        reject(error);
      }
    });
  }

  static async getDeviceFormat(deviceId: string): Promise<AudioFormat> {
    return new Promise((resolve, reject) => {
      try {
        const format = native.AudioController.getDeviceFormat(deviceId);
        resolve(format);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Export raw bindings for testing if needed
export const nativeBindings = bindings;
