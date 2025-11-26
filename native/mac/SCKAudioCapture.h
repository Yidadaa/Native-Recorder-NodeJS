#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <functional>
#include <string>

typedef std::function<void(const uint8_t *, size_t)> SCKDataCallback;
typedef std::function<void(std::string)> SCKErrorCallback;

@interface SCKAudioCapture : NSObject
- (void)startWithCallback:(SCKDataCallback)dataCb
            errorCallback:(SCKErrorCallback)errorCb;
- (void)stop;
@end
