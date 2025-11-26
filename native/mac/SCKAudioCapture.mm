#import "SCKAudioCapture.h"
#import <CoreMedia/CoreMedia.h>
#import <AudioToolbox/AudioToolbox.h>

@interface SCKAudioCapture () <SCStreamOutput>
@property (nonatomic, strong) SCStream *stream;
@property (nonatomic, assign) SCKDataCallback dataCallback;
@property (nonatomic, assign) SCKErrorCallback errorCallback;
@property (nonatomic, assign) AudioConverterRef audioConverter;
@property (nonatomic, assign) AudioStreamBasicDescription inputFormat;
@property (nonatomic, assign) AudioStreamBasicDescription outputFormat;
@property (nonatomic, assign) BOOL isConverterSetup;
@end

@implementation SCKAudioCapture

- (instancetype)init {
    self = [super init];
    if (self) {
        _isConverterSetup = NO;
        _audioConverter = NULL;
    }
    return self;
}

- (void)dealloc {
    [self stop];
    if (_audioConverter) {
        AudioConverterDispose(_audioConverter);
        _audioConverter = NULL;
    }
}

- (void)startWithCallback:(SCKDataCallback)dataCb errorCallback:(SCKErrorCallback)errorCb {
    self.dataCallback = dataCb;
    self.errorCallback = errorCb;

    if (@available(macOS 12.3, *)) {
        [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
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

            self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:nil];
            
            NSError *addError = nil;
            [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_main_queue() error:&addError];
            if (addError) {
                 if (self.errorCallback) self.errorCallback("Failed to add stream output: " + std::string(addError.localizedDescription.UTF8String));
                 return;
            }

            [self.stream startCaptureWithCompletionHandler:^(NSError *error) {
                if (error) {
                    if (self.errorCallback) self.errorCallback("Failed to start capture: " + std::string(error.localizedDescription.UTF8String));
                }
            }];
        }];
    } else {
        if (self.errorCallback) self.errorCallback("ScreenCaptureKit is only available on macOS 12.3+");
    }
}

- (void)stop {
    if (@available(macOS 12.3, *)) {
        if (self.stream) {
            [self.stream stopCaptureWithCompletionHandler:nil];
            self.stream = nil;
        }
    }
    if (_audioConverter) {
        AudioConverterDispose(_audioConverter);
        _audioConverter = NULL;
    }
    _isConverterSetup = NO;
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    if (type != SCStreamOutputTypeAudio || !self.dataCallback) return;

    if (@available(macOS 12.3, *)) {
        CMFormatDescriptionRef formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer);
        const AudioStreamBasicDescription *asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc);
        
        if (!asbd) return;

        if (!self.isConverterSetup) {
            self.inputFormat = *asbd;
            
            // Target format: 48kHz, 16-bit, Stereo, LPCM
            AudioStreamBasicDescription outFormat = {0};
            outFormat.mSampleRate = 48000.0;
            outFormat.mFormatID = kAudioFormatLinearPCM;
            outFormat.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
            outFormat.mBytesPerPacket = 4;
            outFormat.mFramesPerPacket = 1;
            outFormat.mBytesPerFrame = 4;
            outFormat.mChannelsPerFrame = 2;
            outFormat.mBitsPerChannel = 16;
            self.outputFormat = outFormat;
            
            AudioStreamBasicDescription inFormat = self.inputFormat;
            OSStatus status = AudioConverterNew(&inFormat, &outFormat, &_audioConverter);
            if (status != noErr) {
                if (self.errorCallback) self.errorCallback("Failed to create AudioConverter");
                return;
            }
            self.isConverterSetup = YES;
        }

        // Convert audio
        CMBlockBufferRef blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer);
        if (!blockBuffer) return;

        size_t lengthAtOffset, totalLength;
        char *dataPointer;
        OSStatus status = CMBlockBufferGetDataPointer(blockBuffer, 0, &lengthAtOffset, &totalLength, &dataPointer);
        
        if (status != kCMBlockBufferNoErr) return;

        // Calculate number of frames in input
        UInt32 numFrames = (UInt32)CMSampleBufferGetNumSamples(sampleBuffer);
        
        // Allocate buffer for output
        // 48kHz * 2 channels * 2 bytes = 192000 bytes/sec
        // Buffer size depends on input duration.
        // Safe estimate: input size * ratio of bytes per frame?
        // Or just allocate enough.
        
        UInt32 outputBufferSize = numFrames * self.outputFormat.mBytesPerFrame; 
        // Note: Sample rate conversion might change frame count.
        // If input is 48k and output is 48k, frames are same.
        // If input is 44.1k, output frames = input frames * 48000 / 44100.
        
        if (self.inputFormat.mSampleRate != self.outputFormat.mSampleRate) {
             outputBufferSize = (UInt32)(numFrames * (self.outputFormat.mSampleRate / self.inputFormat.mSampleRate) * self.outputFormat.mBytesPerFrame * 1.2); // 1.2 safety factor
        }

        std::vector<uint8_t> outputBuffer(outputBufferSize);
        
        AudioBufferList outBufferList;
        outBufferList.mNumberBuffers = 1;
        outBufferList.mBuffers[0].mNumberChannels = self.outputFormat.mChannelsPerFrame;
        outBufferList.mBuffers[0].mDataByteSize = outputBufferSize;
        outBufferList.mBuffers[0].mData = outputBuffer.data();

        UInt32 outputDataPacketSize = outputBufferSize / self.outputFormat.mBytesPerPacket;

        // We need a complex input callback for AudioConverterFillComplexBuffer
        // But since we have the data in a buffer, we can use a simpler approach if we had AudioConverterConvertComplexBuffer
        // But that is deprecated or not available for all conversions.
        // Let's use AudioConverterFillComplexBuffer with a simple callback.
        
        struct AudioConverterContext {
            const void *sourceData;
            UInt32 sourceSize;
            UInt32 sourcePacketSize;
            BOOL used;
        } context = { dataPointer, (UInt32)totalLength, self.inputFormat.mBytesPerPacket, NO };

        status = AudioConverterFillComplexBuffer(self.audioConverter, 
            [](AudioConverterRef inAudioConverter, UInt32 *ioNumberDataPackets, AudioBufferList *ioData, AudioStreamPacketDescription **outDataPacketDescription, void *inUserData) -> OSStatus {
                AudioConverterContext *ctx = (AudioConverterContext *)inUserData;
                if (ctx->used) {
                    *ioNumberDataPackets = 0;
                    return noErr; // End of stream for this call
                }
                
                ioData->mNumberBuffers = 1;
                ioData->mBuffers[0].mData = (void *)ctx->sourceData;
                ioData->mBuffers[0].mDataByteSize = ctx->sourceSize;
                // ioData->mBuffers[0].mNumberChannels = ...; // Not strictly needed for input
                
                *ioNumberDataPackets = ctx->sourceSize / ctx->sourcePacketSize;
                ctx->used = YES;
                return noErr;
            }, 
            &context, 
            &outputDataPacketSize, 
            &outBufferList, 
            NULL);

        if (status == noErr || status == 1) { // 1 can happen if not enough data?
             self.dataCallback((const uint8_t*)outBufferList.mBuffers[0].mData, outBufferList.mBuffers[0].mDataByteSize);
        }
    }
}

@end
