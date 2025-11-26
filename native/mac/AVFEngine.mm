#import "AVFEngine.h"
#import "SCKAudioCapture.h"
#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

@interface AVFRecorderDelegate : NSObject <AVCaptureAudioDataOutputSampleBufferDelegate>
@property (nonatomic, assign) AudioEngine::DataCallback dataCallback;
@property (nonatomic, assign) AudioEngine::ErrorCallback errorCallback;
@end

@implementation AVFRecorderDelegate
- (void)captureOutput:(AVCaptureOutput *)output didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer fromConnection:(AVCaptureConnection *)connection {
    if (!self.dataCallback) return;

    CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
    if (!blockBuffer) return;

    size_t lengthAtOffset, totalLength;
    char *dataPointer;
    OSStatus status = CMBlockBufferGetDataPointer(blockBuffer, 0, &lengthAtOffset, &totalLength, &dataPointer);
    
    if (status == kCMBlockBufferNoErr) {
        self.dataCallback((const uint8_t*)dataPointer, totalLength);
    }
}
@end

struct AVFEngine::Impl {
    AVCaptureSession *session;
    AVFRecorderDelegate *delegate;
    SCKAudioCapture *sckCapture;
    dispatch_queue_t queue;
    
    Impl() {
        session = nil;
        delegate = nil;
        sckCapture = [[SCKAudioCapture alloc] init];
        queue = nil;
    }
    
    ~Impl() {
        Stop();
    }

    void Stop() {
        if (session) {
            if ([session isRunning]) {
                [session stopRunning];
            }
            session = nil;
        }
        if (sckCapture) {
            [sckCapture stop];
        }
        delegate = nil;
        queue = nil;
    }
};

AVFEngine::AVFEngine() : impl(std::make_unique<Impl>()) {}

AVFEngine::~AVFEngine() = default;

void AVFEngine::Start(const std::string &deviceType, const std::string &deviceId, 
                      DataCallback dataCb, ErrorCallback errorCb) {
    impl->Stop();

    // Determine if this is output (system audio) or input (microphone)
    bool isOutputDevice = (deviceType == AudioEngine::DEVICE_TYPE_OUTPUT);

    if (isOutputDevice) {
        // Output device: use ScreenCaptureKit for system audio
        // On macOS, we only support system-wide capture (deviceId should be "system")
        if (deviceId != AudioEngine::SYSTEM_AUDIO_DEVICE_ID) {
            if (errorCb) errorCb("macOS only supports system-wide audio capture for output devices. Use deviceId='system'.");
            return;
        }
        
        if (@available(macOS 13.0, *)) {
            [impl->sckCapture startWithCallback:dataCb errorCallback:errorCb];
        } else {
            if (errorCb) errorCb("System audio recording requires macOS 13.0 or later.");
        }
        return;
    }

    // Input device: use AVFoundation for microphone
    impl->session = [[AVCaptureSession alloc] init];
    impl->delegate = [[AVFRecorderDelegate alloc] init];
    impl->delegate.dataCallback = dataCb;
    impl->delegate.errorCallback = errorCb;
    impl->queue = dispatch_queue_create("com.native-recorder.audio", DISPATCH_QUEUE_SERIAL);

    // Find device by ID
    AVCaptureDevice *device = [AVCaptureDevice deviceWithUniqueID:[NSString stringWithUTF8String:deviceId.c_str()]];

    if (!device) {
        if (errorCb) errorCb("Device not found: " + deviceId);
        return;
    }

    NSError *error = nil;
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:device error:&error];
    if (error || !input) {
        if (errorCb) errorCb("Could not create device input: " + std::string([error.localizedDescription UTF8String]));
        return;
    }

    if ([impl->session canAddInput:input]) {
        [impl->session addInput:input];
    } else {
        if (errorCb) errorCb("Cannot add input to session");
        return;
    }

    AVCaptureAudioDataOutput *output = [[AVCaptureAudioDataOutput alloc] init];
    
    // Configure output settings for 48kHz 16-bit stereo PCM
    NSDictionary *settings = @{
        AVFormatIDKey: @(kAudioFormatLinearPCM),
        AVSampleRateKey: @48000.0,
        AVNumberOfChannelsKey: @2,
        AVLinearPCMBitDepthKey: @16,
        AVLinearPCMIsFloatKey: @NO,
        AVLinearPCMIsBigEndianKey: @NO,
        AVLinearPCMIsNonInterleaved: @NO
    };
    [output setAudioSettings:settings];

    [output setSampleBufferDelegate:impl->delegate queue:impl->queue];

    if ([impl->session canAddOutput:output]) {
        [impl->session addOutput:output];
    } else {
        if (errorCb) errorCb("Cannot add output to session");
        return;
    }

    [impl->session startRunning];
}

void AVFEngine::Stop() {
    impl->Stop();
}

std::vector<AudioDevice> AVFEngine::GetDevices() {
    std::vector<AudioDevice> devices;
    
    // Get input devices (microphones)
    AVCaptureDeviceDiscoverySession *discoverySession = [AVCaptureDeviceDiscoverySession 
        discoverySessionWithDeviceTypes:@[AVCaptureDeviceTypeMicrophone, AVCaptureDeviceTypeExternal]
        mediaType:AVMediaTypeAudio
        position:AVCaptureDevicePositionUnspecified];
        
    NSArray<AVCaptureDevice *> *avDevices = discoverySession.devices;
    AVCaptureDevice *defaultDevice = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeAudio];

    for (AVCaptureDevice *device in avDevices) {
        AudioDevice d;
        d.id = [device.uniqueID UTF8String];
        d.name = [device.localizedName UTF8String];
        d.type = AudioEngine::DEVICE_TYPE_INPUT;
        d.isDefault = (defaultDevice && [device.uniqueID isEqualToString:defaultDevice.uniqueID]);
        devices.push_back(d);
    }

    // Add system audio output device (only one on macOS)
    if (@available(macOS 13.0, *)) {
        AudioDevice systemDevice;
        systemDevice.id = AudioEngine::SYSTEM_AUDIO_DEVICE_ID;
        systemDevice.name = "System Audio";
        systemDevice.type = AudioEngine::DEVICE_TYPE_OUTPUT;
        systemDevice.isDefault = true; // Only one output device on macOS
        devices.push_back(systemDevice);
    }

    return devices;
}

AudioFormat AVFEngine::GetDeviceFormat(const std::string &deviceId) {
    AudioFormat format = {0, 0, 0, 0};
    
    if (deviceId == AudioEngine::SYSTEM_AUDIO_DEVICE_ID) {
        format.sampleRate = 48000;
        format.channels = 2;
        format.bitDepth = 16;
        format.rawBitDepth = 32;
        return format;
    }

    AVCaptureDevice *device = [AVCaptureDevice deviceWithUniqueID:[NSString stringWithUTF8String:deviceId.c_str()]];

    if (!device) return format;

    // Get the active format description
    CMFormatDescriptionRef formatDesc = device.activeFormat.formatDescription;
    const AudioStreamBasicDescription *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc);

    if (asbd) {
        format.sampleRate = 48000; // Fixed output sample rate
        format.channels = 2; // Fixed output channels (we force stereo in output settings)
        format.rawBitDepth = (int)asbd->mBitsPerChannel;
        format.bitDepth = 16; // We always output 16-bit
    }

    return format;
}

PermissionStatus AVFEngine::CheckPermission() {
    PermissionStatus status;
    
    // Check microphone permission
    AVAuthorizationStatus micStatus = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    status.mic = (micStatus == AVAuthorizationStatusAuthorized);
    
    // Check screen capture permission (for system audio)
    // ScreenCaptureKit doesn't have a direct permission check API,
    // but we can check if we can get shareable content
    if (@available(macOS 13.0, *)) {
        __block BOOL hasScreenPermission = NO;
        dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
        
        [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent * _Nullable shareableContent, NSError * _Nullable error) {
            // If we can get shareable content without error, we have permission
            // If error is nil and we get valid content, permission is granted
            hasScreenPermission = (error == nil && shareableContent != nil);
            dispatch_semaphore_signal(semaphore);
        }];
        
        // Wait for async call with timeout
        dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
        status.system = hasScreenPermission;
    } else {
        // System audio not supported on older macOS
        status.system = NO;
    }
    
    return status;
}

bool AVFEngine::RequestPermission(PermissionType type) {
    __block BOOL granted = NO;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    
    if (type == PermissionType::Mic) {
        // Request microphone permission
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL allowed) {
            granted = allowed;
            dispatch_semaphore_signal(semaphore);
        }];
        
        dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));
        return granted;
    } 
    else if (type == PermissionType::System) {
        // Request screen capture permission for system audio
        if (@available(macOS 13.0, *)) {
            // Attempting to get shareable content will trigger the permission prompt
            // if not already granted
            [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent * _Nullable shareableContent, NSError * _Nullable error) {
                granted = (error == nil && shareableContent != nil);
                dispatch_semaphore_signal(semaphore);
            }];
            
            dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));
            return granted;
        } else {
            return false;
        }
    }
    
    return false;
}
