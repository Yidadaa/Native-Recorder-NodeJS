#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

struct AudioDevice {
  std::string id;
  std::string name;
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

  // Callback for receiving raw PCM data (16-bit, Native Sample Rate,
  // Stereo/Mono)
  using DataCallback = std::function<void(const uint8_t *data, size_t size)>;

  // Callback for receiving error messages
  using ErrorCallback = std::function<void(const std::string &error)>;

  virtual void Start(const std::string &deviceId, bool isLoopback,
                     DataCallback dataCb, ErrorCallback errorCb) = 0;
  virtual void Stop() = 0;
  virtual std::vector<AudioDevice> GetDevices() = 0;
  virtual AudioFormat GetDeviceFormat(const std::string &deviceId) = 0;
};
