#pragma once

#include "AudioEngine.h"
#include <memory>
#include <napi.h>
#include <thread>

class AudioController : public Napi::ObjectWrap<AudioController> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  AudioController(const Napi::CallbackInfo &info);
  ~AudioController();

private:
  static Napi::FunctionReference constructor;

  Napi::Value Start(const Napi::CallbackInfo &info);
  Napi::Value Stop(const Napi::CallbackInfo &info);
  static Napi::Value GetDevices(const Napi::CallbackInfo &info);
  static Napi::Value GetDeviceFormat(const Napi::CallbackInfo &info);

  std::unique_ptr<AudioEngine> engine;
  std::shared_ptr<Napi::ThreadSafeFunction> tsfn;
};
