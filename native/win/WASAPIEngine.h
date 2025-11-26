#pragma once

#ifdef _WIN32

#include "../AudioEngine.h"
#include <atomic>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <thread>
#include <windows.h>
#include <wrl/client.h>

using Microsoft::WRL::ComPtr;

class WASAPIEngine : public AudioEngine {
public:
  WASAPIEngine();
  ~WASAPIEngine();

  void Start(const std::string &deviceType, const std::string &deviceId,
             DataCallback dataCb, ErrorCallback errorCb) override;
  void Stop() override;
  std::vector<AudioDevice> GetDevices() override;
  AudioFormat GetDeviceFormat(const std::string &deviceId) override;

private:
  void RecordingThread();
  std::string GetDeviceName(IMMDevice *device);

  ComPtr<IMMDeviceEnumerator> enumerator;
  std::atomic<bool> isRecording;
  std::thread recordingThread;

  DataCallback dataCallback;
  ErrorCallback errorCallback;
  std::string currentDeviceId;
  std::string currentDeviceType;
};

#endif
