#include "AudioController.h"
#include <napi.h>


Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return AudioController::Init(env, exports);
}

NODE_API_MODULE(native_audio_sdk, Init)
