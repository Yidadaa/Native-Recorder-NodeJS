#include "AudioController.h"
#include <iostream>

// Forward declaration of platform-specific factory
std::unique_ptr<AudioEngine> CreatePlatformAudioEngine();

Napi::FunctionReference AudioController::constructor;

Napi::Object AudioController::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(
      env, "AudioController",
      {InstanceMethod("start", &AudioController::Start),
       InstanceMethod("stop", &AudioController::Stop),
       StaticMethod("getDevices", &AudioController::GetDevices),
       StaticMethod("getDeviceFormat", &AudioController::GetDeviceFormat)});

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("AudioController", func);
  return exports;
}

AudioController::AudioController(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<AudioController>(info) {
  this->engine = CreatePlatformAudioEngine();
}

AudioController::~AudioController() {
  if (this->engine) {
    this->engine->Stop();
  }
  if (this->tsfn) {
    this->tsfn->Release();
  }
}

Napi::Value AudioController::Start(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "Expected config object and callback function")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object config = info[0].As<Napi::Object>();
  std::string deviceId = "";
  bool isLoopback = false;

  if (config.Has("deviceId")) {
    Napi::Value idVal = config.Get("deviceId");
    if (idVal.IsString()) {
      deviceId = idVal.As<Napi::String>().Utf8Value();
    }
  }
  if (config.Has("type")) {
    Napi::Value typeVal = config.Get("type");
    if (typeVal.IsString()) {
      std::string type = typeVal.As<Napi::String>().Utf8Value();
      if (type == "system") {
        isLoopback = true;
      }
    }
  }

  Napi::Function callback =
      info[1].As<Napi::Function>(); // Create a ThreadSafeFunction to call back
                                    // into JS from the audio thread
  this->tsfn = std::make_shared<Napi::ThreadSafeFunction>(
      Napi::ThreadSafeFunction::New(env, callback, "AudioDataCallback", 0, 1));

  auto dataCallback = [tsfn = this->tsfn](const uint8_t *data, size_t size) {
    // Copy data to a vector to pass to the JS thread safely
    auto dataVec = new std::vector<uint8_t>(data, data + size);

    napi_status status =
        tsfn->BlockingCall(dataVec, [](Napi::Env env, Napi::Function jsCallback,
                                       std::vector<uint8_t> *vec) {
          // This runs on the JS main thread
          Napi::Buffer<uint8_t> buffer =
              Napi::Buffer<uint8_t>::Copy(env, vec->data(), vec->size());
          jsCallback.Call({env.Null(), buffer});
          delete vec;
        });

    if (status != napi_ok) {
      // Handle error or shutdown
      delete dataVec;
    }
  };

  auto errorCallback = [tsfn = this->tsfn](const std::string &errorMsg) {
    auto errorStr = new std::string(errorMsg);
    napi_status status = tsfn->BlockingCall(
        errorStr,
        [](Napi::Env env, Napi::Function jsCallback, std::string *str) {
          // Pass error to JS callback as first argument
          jsCallback.Call({Napi::Error::New(env, *str).Value(), env.Null()});
          delete str;
        });
    if (status != napi_ok) {
      delete errorStr;
    }
  };

  try {
    this->engine->Start(deviceId, isLoopback, dataCallback, errorCallback);
  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
  }

  return env.Null();
}

Napi::Value AudioController::Stop(const Napi::CallbackInfo &info) {
  if (this->engine) {
    this->engine->Stop();
  }
  if (this->tsfn) {
    this->tsfn->Release();
    this->tsfn = nullptr;
  }
  return info.Env().Null();
}

Napi::Value AudioController::GetDevices(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  // We need a temporary engine instance to list devices if one doesn't exist,
  // or we can make GetDevices static in AudioEngine if possible.
  // For simplicity, let's create a temporary engine.
  auto tempEngine = CreatePlatformAudioEngine();
  std::vector<AudioDevice> devices = tempEngine->GetDevices();

  Napi::Array result = Napi::Array::New(env, devices.size());
  for (size_t i = 0; i < devices.size(); i++) {
    Napi::Object deviceObj = Napi::Object::New(env);
    deviceObj.Set("id", devices[i].id);
    deviceObj.Set("name", devices[i].name);
    deviceObj.Set("isDefault", devices[i].isDefault);
    result[i] = deviceObj;
  }

  return result;
}

Napi::Value AudioController::GetDeviceFormat(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected deviceId string")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string deviceId = info[0].As<Napi::String>().Utf8Value();

  auto tempEngine = CreatePlatformAudioEngine();
  AudioFormat format = tempEngine->GetDeviceFormat(deviceId);

  if (format.sampleRate == 0) {
    Napi::Error::New(env, "Failed to get device format")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("sampleRate", format.sampleRate);
  result.Set("channels", format.channels);
  result.Set("bitDepth", format.bitDepth);
  result.Set("rawBitDepth", format.rawBitDepth);

  return result;
}
