# Architecture Design

## Overview
The Native Audio SDK is a Node.js addon that provides high-performance, low-latency audio recording capabilities for Windows and macOS. It bridges the asynchronous, event-driven world of JavaScript/TypeScript with the synchronous, real-time nature of native audio APIs.

## System Architecture

```mermaid
graph TD
    JS[Node.js Application] <--> TS[TypeScript Wrapper]
    TS <--> NAPI[N-API / node-addon-api]
    NAPI <--> CPP[C++ AudioController]
    
    subgraph Native Layer
        CPP --> Factory[AudioEngine Factory]
        Factory --> |Windows| WASAPI[WASAPI Engine]
        Factory --> |macOS| AVF[AVFoundation Engine (Stub)]
    end
```

## Core Components

### 1. TypeScript Layer (`src/`)
- **Responsibility**: Provides a type-safe, idiomatic API for consumers. Handles parameter validation and event subscription.
- **Components**:
    - `AudioRecorder`: Main entry point class.
    - `AudioDeviceEnumerator`: Helper to list devices (internal).

### 2. N-API Binding Layer (`native/main.cpp`)
- **Responsibility**: Marshals data between V8 (JS engine) and C++. Handles object wrapping and async workers.
- **Key Mechanism**: Uses `Napi::ThreadSafeFunction` to stream audio data from the native audio thread back to the JS main thread without blocking.

### 3. C++ Core Layer (`native/`)
- **`AudioEngine` (Abstract Base Class)**: Defines the contract for all platform implementations.
    - `Start()`
    - `Stop()`
    - `GetDevices()`
- **`AudioController`**: Manages the lifecycle of the `AudioEngine` and the `ThreadSafeFunction`.

### 4. Platform Implementations
- **Windows (`native/win/`)**:
    - Uses **WASAPI** (Windows Audio Session API) in Event-Driven mode for low latency.
    - `IMMDeviceEnumerator` for device listing.
    - `IAudioClient` / `IAudioCaptureClient` for recording.
    - **Resampling**: Implements software linear interpolation to convert device sample rate to 48kHz.
    - **Format Conversion**: Converts various input formats (Float32, PCM 16/24/32) to PCM 16-bit.
- **macOS (`native/mac/`)**:
    - Currently implemented as a placeholder/stub.

## Threading Model

Audio processing requires strict timing and cannot run on the Node.js main thread (which would cause blocking/stuttering).

1.  **JS Main Thread**: Calls `start()`.
2.  **Native Main Thread**: Initializes audio device.
3.  **Audio Thread (Platform Specific)**:
    - Windows: A dedicated high-priority thread waiting on WASAPI events.
    - macOS: An OS-managed dispatch queue or callback thread.
4.  **Data Flow**:
    - Audio Thread captures PCM data.
    - Data is copied into a thread-safe queue or passed directly if thread-safe.
    - `Napi::ThreadSafeFunction::BlockingCall` is invoked.
    - **JS Main Thread**: Receives the callback, wraps data in a Node.js `Buffer`, and emits a 'data' event.

## Data Format
- **Sample Rate**: Fixed at 48000 Hz (Resampled if necessary).
- **Bit Depth**: Fixed at 16-bit Integer (PCM).
- **Channels**: Preserves source channel count (Mono/Stereo).
- **Endianness**: Little Endian.

## Error Handling
- Native exceptions are caught and converted to JavaScript Errors.
- Async errors during recording are emitted via the `error` event.
