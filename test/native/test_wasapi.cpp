#include "../../native/AudioEngine.h"
#include "../../native/win/WASAPIEngine.h"
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <iostream>
#include <thread>

#ifdef _WIN32
TEST_CASE("WASAPIEngine Creation", "[wasapi]") {
  auto engine = std::make_unique<WASAPIEngine>();
  REQUIRE(engine != nullptr);
}

TEST_CASE("WASAPIEngine GetDevices", "[wasapi]") {
  auto engine = std::make_unique<WASAPIEngine>();
  auto devices = engine->GetDevices();

  // We can't guarantee devices exist on CI, but we can check it doesn't crash
  // and returns a vector (empty or not).
  // If we are on a dev machine, likely there are devices.
  // Let's just print them for debug purposes.
  for (const auto &device : devices) {
    std::cout << "Device: " << device.name << " (" << device.id << ")"
              << std::endl;
  }
  SUCCEED("GetDevices returned without crashing");
}

TEST_CASE("WASAPIEngine Start/Stop Loopback", "[wasapi]") {
  auto engine = std::make_unique<WASAPIEngine>();
  auto devices = engine->GetDevices();

  // Only try to start if we have devices, otherwise it might fail gracefully or
  // throw But Start() catches exceptions internally? No, AudioController
  // catches them. WASAPIEngine::Start does not throw, it calls errorCallback.

  bool errorCalled = false;
  auto errorCb = [&](const std::string &error) {
    // It's okay if it fails to start due to no device, but we want to know.
    std::cout << "Start Error: " << error << std::endl;
    errorCalled = true;
  };

  auto dataCb = [](const uint8_t *data, size_t size) {
    // Data received
  };

  // Try to start loopback on default device
  engine->Start("", true, dataCb, errorCb);

  // Let it run for a bit
  std::this_thread::sleep_for(std::chrono::milliseconds(200));

  engine->Stop();

  SUCCEED("Start/Stop cycle completed");
}

TEST_CASE("WASAPIEngine GetDeviceFormat", "[wasapi]") {
  auto engine = std::make_unique<WASAPIEngine>();
  auto devices = engine->GetDevices();

  if (!devices.empty()) {
    // Test with the first available device
    auto format = engine->GetDeviceFormat(devices[0].id);

    std::cout << "Device Format for " << devices[0].name << ":" << std::endl;
    std::cout << "  Sample Rate: " << format.sampleRate << std::endl;
    std::cout << "  Channels: " << format.channels << std::endl;
    std::cout << "  Output Bit Depth: " << format.bitDepth << std::endl;
    std::cout << "  Native Bit Depth: " << format.rawBitDepth << std::endl;

    REQUIRE(format.sampleRate > 0);
    REQUIRE(format.channels > 0);
    REQUIRE(format.bitDepth == 16);
    REQUIRE(format.rawBitDepth > 0);
  } else {
    WARN("No devices found to test GetDeviceFormat");
  }
}
#endif
