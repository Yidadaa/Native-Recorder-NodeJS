#ifdef _WIN32

#include "WASAPIEngine.h"
#include <algorithm>
#include <functiondiscoverykeys_devpkey.h>
#include <iostream>
#include <vector>

// Macro for error checking removed

const CLSID CLSID_MMDeviceEnumerator = __uuidof(MMDeviceEnumerator);
const IID IID_IMMDeviceEnumerator = __uuidof(IMMDeviceEnumerator);
const IID IID_IAudioClient = __uuidof(IAudioClient);
const IID IID_IAudioCaptureClient = __uuidof(IAudioCaptureClient);

WASAPIEngine::WASAPIEngine() : isRecording(false) {
  CoInitialize(NULL);
  HRESULT hr = CoCreateInstance(CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
                                IID_IMMDeviceEnumerator, (void **)&enumerator);

  if (FAILED(hr)) {
    // Handle error
    std::cerr << "Failed to create IMMDeviceEnumerator" << std::endl;
  }
}

WASAPIEngine::~WASAPIEngine() {
  Stop();
  enumerator.Reset();
  CoUninitialize();
}

void WASAPIEngine::Start(const std::string &deviceId, bool isLoopback,
                         DataCallback dataCb, ErrorCallback errorCb) {
  if (isRecording) {
    return;
  }

  this->dataCallback = dataCb;
  this->errorCallback = errorCb;
  this->currentDeviceId = deviceId;
  this->currentIsLoopback = isLoopback;
  this->isRecording = true;
  this->recordingThread = std::thread(&WASAPIEngine::RecordingThread, this);
}

void WASAPIEngine::Stop() {
  if (isRecording) {
    isRecording = false;
    if (recordingThread.joinable()) {
      recordingThread.join();
    }
  }
}

std::vector<AudioDevice> WASAPIEngine::GetDevices() {
  std::vector<AudioDevice> devices;
  if (!enumerator)
    return devices;

  // Get default device ID
  std::string defaultDeviceId;
  ComPtr<IMMDevice> pDefaultDevice;
  HRESULT hr =
      enumerator->GetDefaultAudioEndpoint(eCapture, eConsole, &pDefaultDevice);
  if (SUCCEEDED(hr)) {
    LPWSTR pwszID = NULL;
    hr = pDefaultDevice->GetId(&pwszID);
    if (SUCCEEDED(hr)) {
      std::wstring wsId(pwszID);
      defaultDeviceId = std::string(wsId.begin(), wsId.end());
      CoTaskMemFree(pwszID);
    }
  }

  ComPtr<IMMDeviceCollection> pCollection;
  hr = enumerator->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE,
                                      &pCollection);
  if (FAILED(hr))
    return devices;

  UINT count;
  pCollection->GetCount(&count);

  for (UINT i = 0; i < count; i++) {
    ComPtr<IMMDevice> pEndpoint;
    hr = pCollection->Item(i, &pEndpoint);
    if (FAILED(hr))
      continue;

    LPWSTR pwszID = NULL;
    hr = pEndpoint->GetId(&pwszID);
    if (FAILED(hr))
      continue;

    std::wstring wsId(pwszID);
    std::string id(
        wsId.begin(),
        wsId.end()); // Simple conversion, should use WideCharToMultiByte
    CoTaskMemFree(pwszID);

    std::string name = GetDeviceName(pEndpoint.Get());

    // Check if default
    bool isDefault = (id == defaultDeviceId);

    devices.push_back({id, name, isDefault});
  }

  return devices;
}

std::string WASAPIEngine::GetDeviceName(IMMDevice *device) {
  ComPtr<IPropertyStore> pProps;
  HRESULT hr = device->OpenPropertyStore(STGM_READ, &pProps);
  if (FAILED(hr))
    return "Unknown Device";

  PROPVARIANT varName;
  PropVariantInit(&varName);
  hr = pProps->GetValue(PKEY_Device_FriendlyName, &varName);
  if (FAILED(hr))
    return "Unknown Device";

  std::wstring wsName(varName.pwszVal);
  std::string name(wsName.begin(), wsName.end()); // Simple conversion
  PropVariantClear(&varName);
  return name;
}

AudioFormat WASAPIEngine::GetDeviceFormat(const std::string &deviceId) {
  AudioFormat format = {0, 0, 0};
  HRESULT hr;
  ComPtr<IMMDevice> pDevice;
  ComPtr<IAudioClient> pAudioClient;
  WAVEFORMATEX *pwfx = NULL;

  if (!enumerator)
    return format;

  if (deviceId.empty()) {
    hr = enumerator->GetDefaultAudioEndpoint(eCapture, eConsole, &pDevice);
  } else {
    std::wstring wsId(deviceId.begin(), deviceId.end());
    hr = enumerator->GetDevice(wsId.c_str(), &pDevice);
  }

  if (FAILED(hr))
    return format;

  hr = pDevice->Activate(IID_IAudioClient, CLSCTX_ALL, NULL,
                         (void **)&pAudioClient);
  if (FAILED(hr))
    return format;

  hr = pAudioClient->GetMixFormat(&pwfx);
  if (FAILED(hr))
    return format;

  format.sampleRate = pwfx->nSamplesPerSec;
  format.channels = pwfx->nChannels;
  format.rawBitDepth = pwfx->wBitsPerSample;
  format.bitDepth = 16; // We always convert to 16-bit PCM

  if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
    WAVEFORMATEXTENSIBLE *pEx = (WAVEFORMATEXTENSIBLE *)pwfx;
    if (pEx->Samples.wValidBitsPerSample > 0) {
      format.rawBitDepth = pEx->Samples.wValidBitsPerSample;
    }
  }

  CoTaskMemFree(pwfx);
  return format;
}

void WASAPIEngine::RecordingThread() {
  CoInitialize(NULL);

  HRESULT hr;
  ComPtr<IMMDeviceEnumerator> pEnumerator;
  ComPtr<IMMDevice> pDevice;
  ComPtr<IAudioClient> pAudioClient;
  ComPtr<IAudioCaptureClient> pCaptureClient;
  WAVEFORMATEX *pwfx = NULL;
  UINT32 bufferFrameCount;
  UINT32 numFramesAvailable;
  UINT32 packetLength = 0;
  BYTE *pData;
  DWORD flags;
  HANDLE hEvent = NULL;

  do {
    // Create a new enumerator for this thread
    hr = CoCreateInstance(CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
                          IID_IMMDeviceEnumerator, (void **)&pEnumerator);

    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback(
            "Failed to create IMMDeviceEnumerator in recording thread");
      break;
    }

    // 1. Get Device
    if (currentDeviceId.empty()) {
      // If loopback, we usually want the default render device
      EDataFlow dataFlow = currentIsLoopback ? eRender : eCapture;
      hr = pEnumerator->GetDefaultAudioEndpoint(dataFlow, eConsole, &pDevice);
    } else {
      std::wstring wsId(currentDeviceId.begin(), currentDeviceId.end());
      hr = pEnumerator->GetDevice(wsId.c_str(), &pDevice);
    }
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to get audio device");
      break;
    }

    // 2. Activate Audio Client
    hr = pDevice->Activate(IID_IAudioClient, CLSCTX_ALL, NULL,
                           (void **)&pAudioClient);
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to activate audio client");
      break;
    }

    // 3. Get Mix Format
    hr = pAudioClient->GetMixFormat(&pwfx);
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to get mix format");
      break;
    }

    // 4. Initialize Audio Client
    DWORD streamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK;
    if (currentIsLoopback) {
      streamFlags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
    }

    hr = pAudioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                  10000000, 0, pwfx, NULL);

    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to initialize audio client");
      break;
    }

    // 5. Set Event Handle
    hEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
    hr = pAudioClient->SetEventHandle(hEvent);
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to set event handle");
      break;
    }

    // 6. Get Capture Client
    hr = pAudioClient->GetService(IID_IAudioCaptureClient,
                                  (void **)&pCaptureClient);
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to get capture client");
      break;
    }

    // 7. Start Recording
    hr = pAudioClient->Start();
    if (FAILED(hr)) {
      if (errorCallback)
        errorCallback("Failed to start recording");
      break;
    }

    while (isRecording) {
      DWORD retval = WaitForSingleObject(hEvent, 2000);
      if (retval != WAIT_OBJECT_0) {
        // Timeout or error
        continue;
      }

      hr = pCaptureClient->GetNextPacketSize(&packetLength);
      if (FAILED(hr)) {
        if (errorCallback)
          errorCallback("Failed to get next packet size");
        break;
      }

      while (packetLength != 0) {
        hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags,
                                       NULL, NULL);

        if (FAILED(hr)) {
          if (errorCallback)
            errorCallback("Failed to get buffer");
          break;
        }

        if (numFramesAvailable > 0) {
          // 1. Convert to Float32
          std::vector<float> inputFloats;
          size_t numSamples = numFramesAvailable * pwfx->nChannels;
          inputFloats.resize(numSamples);

          if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
            std::fill(inputFloats.begin(), inputFloats.end(), 0.0f);
          } else {
            bool isFloat = false;
            if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE) {
              WAVEFORMATEXTENSIBLE *pEx = (WAVEFORMATEXTENSIBLE *)pwfx;
              if (IsEqualGUID(pEx->SubFormat,
                              KSDATAFORMAT_SUBTYPE_IEEE_FLOAT)) {
                isFloat = true;
              }
            } else if (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
              isFloat = true;
            }

            if (isFloat) {
              float *floatData = (float *)pData;
              std::copy(floatData, floatData + numSamples, inputFloats.begin());
            } else {
              // Assume PCM (16-bit usually)
              if (pwfx->wBitsPerSample == 16) {
                int16_t *pcmData = (int16_t *)pData;
                for (size_t i = 0; i < numSamples; i++) {
                  inputFloats[i] = pcmData[i] / 32768.0f;
                }
              } else if (pwfx->wBitsPerSample == 24) {
                uint8_t *ptr = (uint8_t *)pData;
                for (size_t i = 0; i < numSamples; i++) {
                  // 24-bit is 3 bytes. Shift to high 24 bits of 32-bit int.
                  int32_t sample =
                      (ptr[0] << 8) | (ptr[1] << 16) | (ptr[2] << 24);
                  inputFloats[i] = sample / 2147483648.0f;
                  ptr += 3;
                }
              } else if (pwfx->wBitsPerSample == 32) {
                int32_t *ptr = (int32_t *)pData;
                for (size_t i = 0; i < numSamples; i++) {
                  inputFloats[i] = ptr[i] / 2147483648.0f;
                }
              } else {
                // Fallback for other formats: treat as silence or noise?
                // Just copy as if 8 bit? No, unsafe.
                // Let's fill silence to avoid noise blast
                std::fill(inputFloats.begin(), inputFloats.end(), 0.0f);
              }
            }
          }

          // 2. Convert to Int16 and Callback (No Resampling)
          if (!inputFloats.empty()) {
            std::vector<int16_t> pcmData;
            pcmData.reserve(inputFloats.size());

            for (float sample : inputFloats) {
              // Clip
              if (sample > 1.0f)
                sample = 1.0f;
              if (sample < -1.0f)
                sample = -1.0f;
              pcmData.push_back((int16_t)(sample * 32767.0f));
            }

            if (dataCallback) {
              dataCallback((uint8_t *)pcmData.data(),
                           pcmData.size() * sizeof(int16_t));
            }
          }
        }

        hr = pCaptureClient->ReleaseBuffer(numFramesAvailable);
        if (FAILED(hr)) {
          if (errorCallback)
            errorCallback("Failed to release buffer");
          break;
        }

        hr = pCaptureClient->GetNextPacketSize(&packetLength);
        if (FAILED(hr)) {
          if (errorCallback)
            errorCallback("Failed to get next packet size loop");
          break;
        }
      }
      // Check if we broke out of inner loop due to error
      if (FAILED(hr))
        break;
    }

    if (pAudioClient)
      pAudioClient->Stop();

  } while (false);

  if (pwfx)
    CoTaskMemFree(pwfx);
  if (hEvent)
    CloseHandle(hEvent);
  CoUninitialize();
}

#endif
