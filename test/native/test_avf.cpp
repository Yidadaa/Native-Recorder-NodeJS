#include "../../native/AudioEngine.h"
#ifdef __APPLE__
#include "../../native/mac/AVFEngine.h"
#endif
#include <catch2/catch_test_macros.hpp>
#include <chrono>
#include <iostream>
#include <thread>

#ifdef __APPLE__

TEST_CASE("AVFEngine Creation", "[avf]") {
  auto engine = std::make_unique<AVFEngine>();
  REQUIRE(engine != nullptr);
}

TEST_CASE("AVFEngine GetDevices", "[avf]") {
  auto engine = std::make_unique<AVFEngine>();
  auto devices = engine->GetDevices();

  bool hasInput = false;
  bool hasOutput = false;

  for (const auto &device : devices) {
    std::cout << "Device: " << device.name << " (" << device.id << ")"
              << " [" << device.type << "]"
              << (device.isDefault ? " (Default)" : "") << std::endl;

    REQUIRE(!device.id.empty());
    REQUIRE(!device.type.empty());
    REQUIRE((device.type == AudioEngine::DEVICE_TYPE_INPUT ||
             device.type == AudioEngine::DEVICE_TYPE_OUTPUT));

    if (device.type == AudioEngine::DEVICE_TYPE_INPUT)
      hasInput = true;
    if (device.type == AudioEngine::DEVICE_TYPE_OUTPUT)
      hasOutput = true;
  }

  // On macOS 12.3+, we should have at least one output device (system audio)
  std::cout << "Has input devices: " << hasInput << std::endl;
  std::cout << "Has output devices: " << hasOutput << std::endl;

  SUCCEED("GetDevices returned without crashing");
}

TEST_CASE("AVFEngine GetDeviceFormat", "[avf]") {
  auto engine = std::make_unique<AVFEngine>();
  auto devices = engine->GetDevices();

  // Test input device format
  auto inputDevices = std::vector<AudioDevice>();
  for (const auto &d : devices) {
    if (d.type == AudioEngine::DEVICE_TYPE_INPUT)
      inputDevices.push_back(d);
  }

  if (!inputDevices.empty()) {
    auto format = engine->GetDeviceFormat(inputDevices[0].id);

    std::cout << "Device Format for " << inputDevices[0].name << ":"
              << std::endl;
    std::cout << "  Sample Rate: " << format.sampleRate << std::endl;
    std::cout << "  Channels: " << format.channels << std::endl;
    std::cout << "  Output Bit Depth: " << format.bitDepth << std::endl;
    std::cout << "  Native Bit Depth: " << format.rawBitDepth << std::endl;

    REQUIRE(format.sampleRate > 0);
    REQUIRE(format.channels > 0);
    REQUIRE(format.bitDepth == 16);
  } else {
    WARN("No input devices found to test GetDeviceFormat");
  }

  // Test system audio format
  auto format = engine->GetDeviceFormat(AudioEngine::SYSTEM_AUDIO_DEVICE_ID);
  std::cout << "System Audio Format:" << std::endl;
  std::cout << "  Sample Rate: " << format.sampleRate << std::endl;
  std::cout << "  Channels: " << format.channels << std::endl;
  REQUIRE(format.sampleRate == 48000);
  REQUIRE(format.channels == 2);
}

TEST_CASE("AVFEngine Start/Stop Microphone", "[avf]") {
  auto engine = std::make_unique<AVFEngine>();
  auto devices = engine->GetDevices();

  // Find first input device
  std::string inputDeviceId;
  for (const auto &d : devices) {
    if (d.type == AudioEngine::DEVICE_TYPE_INPUT) {
      inputDeviceId = d.id;
      break;
    }
  }

  if (inputDeviceId.empty()) {
    WARN("No input devices found to test microphone recording");
    SUCCEED("Skipped - no input devices");
    return;
  }

  bool errorCalled = false;
  auto errorCb = [&](const std::string &error) {
    std::cout << "Start Error: " << error << std::endl;
    errorCalled = true;
  };

  bool dataReceived = false;
  auto dataCb = [&](const uint8_t *data, size_t size) {
    if (size > 0)
      dataReceived = true;
  };

  // Start microphone with deviceType and deviceId
  engine->Start(AudioEngine::DEVICE_TYPE_INPUT, inputDeviceId, dataCb, errorCb);

  std::this_thread::sleep_for(std::chrono::milliseconds(500));

  engine->Stop();

  SUCCEED("Start/Stop cycle completed");
}

TEST_CASE("AVFEngine Start/Stop System Audio (SCK)", "[avf]") {
  auto engine = std::make_unique<AVFEngine>();

  bool errorCalled = false;
  auto errorCb = [&](const std::string &error) {
    std::cout << "Start Error: " << error << std::endl;
    errorCalled = true;
  };

  bool dataReceived = false;
  auto dataCb = [&](const uint8_t *data, size_t size) {
    if (size > 0)
      dataReceived = true;
  };

  // Start system audio with deviceType=output and deviceId=system
  engine->Start(AudioEngine::DEVICE_TYPE_OUTPUT,
                AudioEngine::SYSTEM_AUDIO_DEVICE_ID, dataCb, errorCb);

  std::this_thread::sleep_for(std::chrono::milliseconds(500));

  engine->Stop();

  SUCCEED("Start/Stop cycle completed");
}

#endif
