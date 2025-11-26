#import "SCKAudioCapture.h"
#import <CoreMedia/CoreMedia.h>
#include <vector>

@interface SCKAudioCapture () <SCStreamOutput, SCStreamDelegate>
@property (nonatomic, strong) SCStream *stream;
@property (nonatomic, assign) SCKDataCallback dataCallback;
@property (nonatomic, assign) SCKErrorCallback errorCallback;
@property (nonatomic, strong) dispatch_queue_t captureQueue;
@end

@implementation SCKAudioCapture

- (instancetype)init {
    self = [super init];
    if (self) {
        // Create a dedicated serial queue for audio capture callbacks
        // This is crucial because Node.js doesn't run the Cocoa main run loop
        _captureQueue = dispatch_queue_create("com.native-recorder.sck-audio", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

- (void)dealloc {
    [self stop];
}

- (void)startWithCallback:(SCKDataCallback)dataCb errorCallback:(SCKErrorCallback)errorCb {
    self.dataCallback = dataCb;
    self.errorCallback = errorCb;

    if (@available(macOS 13.0, *)) {
        [SCShareableContent getShareableContentExcludingDesktopWindows:YES
                                                  onScreenWindowsOnly:NO
                                                    completionHandler:^(SCShareableContent *content, NSError *error) {
            dispatch_async(self.captureQueue, ^{
                if (error) {
                    if (self.errorCallback) self.errorCallback("Failed to get shareable content: " + std::string(error.localizedDescription.UTF8String));
                    return;
                }

                SCDisplay *display = content.displays.firstObject;
                if (!display) {
                    if (self.errorCallback) self.errorCallback("No display found");
                    return;
                }

                SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:display excludingWindows:@[]];
                
                SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
                config.capturesAudio = YES;
                config.sampleRate = 48000;
                config.channelCount = 2;
                config.excludesCurrentProcessAudio = NO;
                
                // Minimize video overhead since we only need audio
                config.width = 2;
                config.height = 2;
                config.minimumFrameInterval = CMTimeMake(1, 1); // 1 fps for video
                config.showsCursor = NO;

                self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
                
                NSError *addError = nil;
                [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:self.captureQueue error:&addError];
                if (addError) {
                    if (self.errorCallback) self.errorCallback("Failed to add stream output: " + std::string(addError.localizedDescription.UTF8String));
                    return;
                }

                [self.stream startCaptureWithCompletionHandler:^(NSError *startError) {
                    if (startError) {
                        if (self.errorCallback) self.errorCallback("Failed to start capture: " + std::string(startError.localizedDescription.UTF8String));
                    }
                }];
            });
        }];
    } else {
        if (self.errorCallback) self.errorCallback("ScreenCaptureKit audio capture requires macOS 13.0+");
    }
}

- (void)stop {
    if (@available(macOS 13.0, *)) {
        if (self.stream) {
            [self.stream stopCaptureWithCompletionHandler:nil];
            self.stream = nil;
        }
    }
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (type != SCStreamOutputTypeAudio || !self.dataCallback) return;

    if (@available(macOS 13.0, *)) {
        CMFormatDescriptionRef formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer);
        const AudioStreamBasicDescription *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc);
        
        if (!asbd) return;

        // Check if audio is non-interleaved (planar)
        bool isNonInterleaved = (asbd->mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0;
        bool isFloat = (asbd->mFormatFlags & kAudioFormatFlagIsFloat) != 0;
        int channels = asbd->mChannelsPerFrame;

        if (isNonInterleaved) {
            // Non-interleaved audio: each channel is in a separate buffer
            // We need to use CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer
            CMBlockBufferRef blockBuffer = NULL;
            
            // First, get the required buffer list size
            size_t bufferListSizeNeeded = 0;
            OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
                sampleBuffer,
                &bufferListSizeNeeded,
                NULL,
                0,
                NULL,
                NULL,
                0,
                &blockBuffer
            );
            
            if (bufferListSizeNeeded == 0) {
                // Fallback: estimate size based on channel count
                bufferListSizeNeeded = sizeof(AudioBufferList) + (channels - 1) * sizeof(AudioBuffer);
            }
            
            AudioBufferList *audioBufferList = (AudioBufferList *)malloc(bufferListSizeNeeded);
            status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
                sampleBuffer,
                NULL,
                audioBufferList,
                bufferListSizeNeeded,
                NULL,
                NULL,
                kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
                &blockBuffer
            );
            
            if (status != noErr || !audioBufferList) {
                if (audioBufferList) free(audioBufferList);
                if (blockBuffer) CFRelease(blockBuffer);
                return;
            }
            
            // Get the number of frames
            CMItemCount numFrames = CMSampleBufferGetNumSamples(sampleBuffer);
            
            if (isFloat && asbd->mBitsPerChannel == 32) {
                // Interleave channels and convert float to int16
                std::vector<int16_t> outputBuffer(numFrames * channels);
                
                for (CMItemCount frame = 0; frame < numFrames; frame++) {
                    for (int ch = 0; ch < channels && ch < (int)audioBufferList->mNumberBuffers; ch++) {
                        const float *channelData = (const float *)audioBufferList->mBuffers[ch].mData;
                        float sample = channelData[frame];
                        // Clamp to [-1.0, 1.0]
                        if (sample > 1.0f) sample = 1.0f;
                        if (sample < -1.0f) sample = -1.0f;
                        // Convert to 16-bit and interleave
                        outputBuffer[frame * channels + ch] = (int16_t)(sample * 32767.0f);
                    }
                }
                
                self.dataCallback((const uint8_t*)outputBuffer.data(), outputBuffer.size() * sizeof(int16_t));
            }
            
            free(audioBufferList);
            if (blockBuffer) CFRelease(blockBuffer);
        } else {
            // Interleaved audio: original code path
            CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
            if (!blockBuffer) return;

            size_t totalLength = 0;
            char *dataPointer = NULL;
            OSStatus status = CMBlockBufferGetDataPointer(blockBuffer, 0, NULL, &totalLength, &dataPointer);
            
            if (status != kCMBlockBufferNoErr || !dataPointer) return;

            // ScreenCaptureKit outputs 32-bit float audio
            // Convert to 16-bit signed integer PCM for consistency with other sources
            if (isFloat && asbd->mBitsPerChannel == 32) {
                size_t numSamples = totalLength / sizeof(float);
                std::vector<int16_t> outputBuffer(numSamples);
                
                const float *floatData = (const float *)dataPointer;
                for (size_t i = 0; i < numSamples; i++) {
                    float sample = floatData[i];
                    // Clamp to [-1.0, 1.0]
                    if (sample > 1.0f) sample = 1.0f;
                    if (sample < -1.0f) sample = -1.0f;
                    // Convert to 16-bit
                    outputBuffer[i] = (int16_t)(sample * 32767.0f);
                }
                
                self.dataCallback((const uint8_t*)outputBuffer.data(), numSamples * sizeof(int16_t));
            }
        }
    }
}

// SCStreamDelegate method
- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    if (@available(macOS 13.0, *)) {
        if (error && self.errorCallback) {
            self.errorCallback("Stream stopped with error: " + std::string(error.localizedDescription.UTF8String));
        }
    }
}

@end
