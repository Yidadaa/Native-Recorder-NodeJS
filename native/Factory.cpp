#include "AudioEngine.h"
#include <memory>

#ifdef _WIN32
#include "win/WASAPIEngine.h"
#elif defined(__APPLE__)
#include "mac/AVFEngine.h"
#endif

std::unique_ptr<AudioEngine> CreatePlatformAudioEngine() {
#ifdef _WIN32
  return std::make_unique<WASAPIEngine>();
#elif defined(__APPLE__)
  return std::make_unique<AVFEngine>();
#else
  return nullptr;
#endif
}
