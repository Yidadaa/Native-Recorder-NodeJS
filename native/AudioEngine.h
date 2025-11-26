#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

struct AudioDevice {
  std::string id;
  std::string name;
  std::string type; // "input" or "output"
  bool isDefault;
};

struct AudioFormat {
  int sampleRate;
  int channels;
  int bitDepth;    // Output bit depth (always 16 for now)
  int rawBitDepth; // Native device bit depth
};

class AudioEngine {
public:
  virtual ~AudioEngine() = default;

  // Device type constants
  static constexpr const char *DEVICE_TYPE_INPUT = "input";
  static constexpr const char *DEVICE_TYPE_OUTPUT = "output";

  // Special device ID for system-wide audio capture (macOS)
  static constexpr const char *SYSTEM_AUDIO_DEVICE_ID = "system";

  // Callback for receiving raw PCM data (16-bit, Native Sample Rate,
  // Stereo/Mono)
  using DataCallback = std::function<void(const uint8_t *data, size_t size)>;

  // Callback for receiving error messages
  using ErrorCallback = std::function<void(const std::string &error)>;

  // Start recording with explicit device type and ID
  // deviceType: "input" or "output"
  // deviceId: device identifier from GetDevices() (never empty)
  virtual void Start(const std::string &deviceType, const std::string &deviceId,
                     DataCallback dataCb, ErrorCallback errorCb) = 0;
  virtual void Stop() = 0;

  // Get all available devices (both input and output)
  // All returned devices have valid id and type fields
  virtual std::vector<AudioDevice> GetDevices() = 0;

  // Get format for specific device
  virtual AudioFormat GetDeviceFormat(const std::string &deviceId) = 0;
};
