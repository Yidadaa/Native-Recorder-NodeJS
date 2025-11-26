#pragma once

#include "../AudioEngine.h"
#include <memory>

class AVFEngine : public AudioEngine {
public:
  AVFEngine();
  ~AVFEngine();

  void Start(const std::string &deviceType, const std::string &deviceId,
             DataCallback dataCb, ErrorCallback errorCb) override;
  void Stop() override;
  std::vector<AudioDevice> GetDevices() override;
  AudioFormat GetDeviceFormat(const std::string &deviceId) override;

  // Permission handling
  PermissionStatus CheckPermission() override;
  bool RequestPermission(PermissionType type) override;

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};
