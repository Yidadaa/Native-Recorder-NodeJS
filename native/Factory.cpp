#include "AudioEngine.h"
#include <memory>

#ifdef _WIN32
#include "win/WASAPIEngine.h"
#endif

// Placeholder for macOS implementation
class AVFEngine : public AudioEngine {
public:
  void Start(const std::string &deviceId, bool isLoopback, DataCallback dataCb,
             ErrorCallback errorCb) override {}
  void Stop() override {}
  std::vector<AudioDevice> GetDevices() override { return {}; }
};

std::unique_ptr<AudioEngine> CreatePlatformAudioEngine() {
#ifdef _WIN32
  return std::make_unique<WASAPIEngine>();
#else
  return std::make_unique<AVFEngine>();
#endif
}
