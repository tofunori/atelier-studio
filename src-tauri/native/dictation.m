#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>
#import <Speech/Speech.h>
#import <math.h>
#include "dictation_meter.h"

typedef void (*AtelierDictationCallback)(const char *, const char *, const char *, const char *, float);

// All session state lives on the main queue. Audio buffers go straight to the
// recognition request: neither recordings nor audio chunks are persisted.
@interface AtelierDictation : NSObject {
    AtelierDictationMeter _meter;
}
@property(nonatomic, copy) NSString *session;
@property(nonatomic, copy) NSString *transcript;
// Long-form dictation: the recognizer may restart its window and report
// hypotheses that only cover recent audio. `committed` keeps the text of the
// previous windows; `windowStart` is the first-segment timestamp of the
// current one (seconds since the request began).
@property(nonatomic, copy) NSString *committed;
@property(nonatomic) NSTimeInterval windowStart;
@property(nonatomic) AtelierDictationCallback callback;
@property(nonatomic, strong) SFSpeechRecognizer *recognizer;
@property(nonatomic, strong) SFSpeechAudioBufferRecognitionRequest *request;
@property(nonatomic, strong) SFSpeechRecognitionTask *task;
@property(nonatomic, strong) AVAudioEngine *engine;
@property(nonatomic) BOOL hasTap;
@property(nonatomic) BOOL finishing;
@property(nonatomic) float peakLevel;
- (void)start:(NSString *)session locale:(NSString *)locale callback:(AtelierDictationCallback)callback;
- (void)stop:(NSString *)session;
- (void)cancel:(NSString *)session;
@end

@implementation AtelierDictation
- (BOOL)isCurrent:(NSString *)session {
    return self.session != nil && [self.session isEqualToString:session];
}

- (void)emit:(NSString *)status error:(NSString *)error {
    if (self.session && self.callback) {
        self.callback(self.session.UTF8String, status.UTF8String,
                      (self.transcript ?: @"").UTF8String, error.UTF8String, 0);
    }
}

- (void)stopAudio {
    [self.engine stop];
    if (self.hasTap) {
        [self.engine.inputNode removeTapOnBus:0];
        self.hasTap = NO;
    }
}

- (void)finish:(NSString *)error {
    if (!self.session) return;
    NSString *session = self.session;
    NSString *transcript = self.transcript ?: @"";
    NSLog(@"[AtelierDictation] finish error=%@ chars=%lu peak=%.4f meterPeak=%.3f", error ?: @"none", (unsigned long)transcript.length, self.peakLevel, _meter.peakLevel);
    AtelierDictationCallback callback = self.callback;
    // Invalidate before cancellation; a terminal callback may already be queued.
    self.session = nil;
    [self stopAudio];
    [self.request endAudio];
    [self.task cancel];
    self.task = nil;
    self.request = nil;
    self.recognizer = nil;
    self.engine = nil;
    self.callback = NULL;
    self.finishing = NO;
    if (callback) {
        callback(session.UTF8String, error ? "error" : "stopped",
                 transcript.UTF8String, error.UTF8String, 0);
    }
}

- (void)beginAudio:(NSString *)session locale:(NSString *)locale {
    if (![self isCurrent:session]) return;
    self.recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:locale]];
    if (!self.recognizer || !self.recognizer.available) {
        [self finish:@"unavailable"];
        return;
    }
    self.recognizer.queue = NSOperationQueue.mainQueue;
    self.committed = @"";
    self.windowStart = 0;
    self.request = [SFSpeechAudioBufferRecognitionRequest new];
    self.request.shouldReportPartialResults = YES;
    self.request.taskHint = SFSpeechRecognitionTaskHintDictation;
    self.request.requiresOnDeviceRecognition = self.recognizer.supportsOnDeviceRecognition;
    if ([NSProcessInfo.processInfo isOperatingSystemAtLeastVersion:(NSOperatingSystemVersion){13, 0, 0}]) self.request.addsPunctuation = YES;
    self.engine = [AVAudioEngine new];
    @try {
        AVAudioInputNode *input = self.engine.inputNode;
        // Capture in the microphone's hardware format. The engine's output
        // format may still describe the previous/default output device.
        AVAudioFormat *format = [input inputFormatForBus:0];
        if (format.channelCount == 0 || format.sampleRate == 0) {
            [self finish:@"no-input"];
            return;
        }
        SFSpeechAudioBufferRecognitionRequest *request = self.request;
        __weak AtelierDictation *weakSelf = self;
        __block double meteredFrames = 0;
        __block float intervalPeak = 0;
        NSLog(@"[AtelierDictation] audio locale=%@ sampleRate=%.0f channels=%u onDevice=%d", locale, format.sampleRate, format.channelCount, self.request.requiresOnDeviceRecognition);
        [input installTapOnBus:0 bufferSize:1024 format:format
                         block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
            (void)when;
            [request appendAudioPCMBuffer:buffer];
            float *const *channels = buffer.floatChannelData;
            if (channels && buffer.frameLength > 0) {
                for (AVAudioChannelCount channel = 0; channel < buffer.format.channelCount; channel++) {
                    double sum = 0;
                    for (AVAudioFrameCount frame = 0; frame < buffer.frameLength; frame++) {
                        float value = channels[channel][frame * buffer.stride];
                        sum += value * value;
                    }
                    intervalPeak = fmaxf(intervalPeak, sqrtf(sum / buffer.frameLength));
                }
            }
            meteredFrames += buffer.frameLength;
            if (meteredFrames >= format.sampleRate / 12) {
                float rms = intervalPeak;
                meteredFrames = 0;
                intervalPeak = 0;
                dispatch_async(dispatch_get_main_queue(), ^{
                    AtelierDictation *owner = weakSelf;
                    if (![owner isCurrent:session] || owner.finishing) return;
                    // Meter state and recognition hints share the main queue.
                    float level = atelier_dictation_meter_level(&owner->_meter, rms);
                    owner.peakLevel = fmaxf(owner.peakLevel, rms);
                    if (owner.callback) owner.callback(session.UTF8String, "level", "", NULL, level);
                });
            }
        }];
        self.hasTap = YES;
        self.task = [self.recognizer recognitionTaskWithRequest:self.request
            resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    AtelierDictation *owner = weakSelf;
                    if (!owner || ![owner isCurrent:session]) return;
                    // Speech may return an empty final result after usable
                    // partial words, especially following a pause or endAudio.
                    NSString *hypothesis = result.bestTranscription.formattedString;
                    if (hypothesis.length > 0) {
                        atelier_dictation_meter_speech(&owner->_meter);
                        // A hypothesis whose first segment starts well after the
                        // current window began no longer covers the earlier
                        // audio: the recognizer moved on. Commit what the previous
                        // window produced instead of letting it vanish (long
                        // dictations kept only the last sentences, 2026-09-10).
                        SFTranscriptionSegment *first = result.bestTranscription.segments.firstObject;
                        NSTimeInterval firstStart = first ? first.timestamp : owner.windowStart;
                        if (owner.transcript.length > 0 && firstStart > owner.windowStart + 1.0) {
                            NSString *previous = owner.transcript;
                            NSString *head = owner.committed.length ? owner.committed : @"";
                            NSUInteger cut = head.length;
                            if (cut && [previous hasPrefix:head]) previous = [previous substringFromIndex:cut];
                            previous = [previous stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
                            if (previous.length) head = head.length ? [head stringByAppendingFormat:@" %@", previous] : previous;
                            owner.committed = head;
                            owner.windowStart = firstStart;
                            NSLog(@"[AtelierDictation] window restart at %.2fs, committed=%lu chars", firstStart, (unsigned long)head.length);
                        }
                        owner.transcript = owner.committed.length
                            ? [owner.committed stringByAppendingFormat:@" %@", hypothesis]
                            : hypothesis;
                        [owner emit:@"result" error:nil];
                    }
                    if (result.isFinal) {
                        [owner finish:owner.transcript.length ? nil : @"no-speech"];
                    } else if (error) {
                        NSLog(@"[AtelierDictation] recognition error domain=%@ code=%ld", error.domain, (long)error.code);
                        // Closing the audio stream can report an error after a
                        // usable partial result. Preserve the visible draft.
                        BOOL noSpeech = [error.domain isEqualToString:@"kAFAssistantErrorDomain"] && error.code == 1110;
                        BOOL benign = owner.transcript.length > 0 && (owner.finishing || noSpeech);
                        [owner finish:benign ? nil : noSpeech ? @"no-speech" : @"recognition-failed"];
                    }
                });
            }];
        [self.engine prepare];
        NSError *error = nil;
        if (![self.engine startAndReturnError:&error]) {
            NSLog(@"[AtelierDictation] capture error domain=%@ code=%ld", error.domain, (long)error.code);
            [self finish:@"capture-failed"];
            return;
        }
    } @catch (NSException *exception) {
        [self finish:@"capture-failed"];
        return;
    }
    [self emit:@"listening" error:nil];
    // Server-based recognition is capped at one minute by Apple; on-device
    // recognition is not, so give long dictations room (draft retained at
    // the limit either way).
    int64_t capSeconds = self.request.requiresOnDeviceRecognition ? 10 * 60 : 60;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, capSeconds * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [self stop:session];
    });
}

- (void)requestMicrophone:(NSString *)session locale:(NSString *)locale {
    if (![self isCurrent:session]) return;
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio];
    if (status == AVAuthorizationStatusAuthorized) {
        [self beginAudio:session locale:locale];
    } else if (status == AVAuthorizationStatusNotDetermined) {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (![self isCurrent:session]) return;
                if (granted) [self beginAudio:session locale:locale];
                else [self finish:@"microphone-denied"];
            });
        }];
    } else {
        [self finish:@"microphone-denied"];
    }
}

- (void)start:(NSString *)session locale:(NSString *)locale callback:(AtelierDictationCallback)callback {
    if (self.session) {
        callback(session.UTF8String, "error", "", "busy", 0);
        return;
    }
    self.session = session;
    self.transcript = @"";
    self.callback = callback;
    self.finishing = NO;
    self.peakLevel = 0;
    _meter = (AtelierDictationMeter){0};
    SFSpeechRecognizerAuthorizationStatus status = SFSpeechRecognizer.authorizationStatus;
    if (status == SFSpeechRecognizerAuthorizationStatusAuthorized) {
        [self requestMicrophone:session locale:locale];
    } else if (status == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus result) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (![self isCurrent:session]) return;
                if (result == SFSpeechRecognizerAuthorizationStatusAuthorized) {
                    [self requestMicrophone:session locale:locale];
                } else [self finish:@"speech-denied"];
            });
        }];
    } else {
        [self finish:@"speech-denied"];
    }
}

- (void)stop:(NSString *)session {
    if (![self isCurrent:session] || self.finishing) return;
    if (!self.request) { [self finish:nil]; return; }
    self.finishing = YES;
    NSLog(@"[AtelierDictation] stop requested");
    [self stopAudio];
    [self.request endAudio];
    [self emit:@"finishing" error:nil];
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 4 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        if ([self isCurrent:session]) [self finish:self.transcript.length ? nil : @"no-speech"];
    });
}

- (void)cancel:(NSString *)session {
    if ([self isCurrent:session]) {
        NSLog(@"[AtelierDictation] cancel requested");
        [self finish:nil];
    }
}
@end

static AtelierDictation *controller(void) {
    static AtelierDictation *instance;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ instance = [AtelierDictation new]; });
    return instance;
}

void atelier_dictation_start(const char *session, const char *locale, AtelierDictationCallback callback) {
    NSString *sessionValue = [NSString stringWithUTF8String:session];
    NSString *localeValue = [NSString stringWithUTF8String:locale];
    dispatch_async(dispatch_get_main_queue(), ^{
        [controller() start:sessionValue locale:localeValue callback:callback];
    });
}

void atelier_dictation_stop(const char *session) {
    NSString *value = [NSString stringWithUTF8String:session];
    dispatch_async(dispatch_get_main_queue(), ^{ [controller() stop:value]; });
}

void atelier_dictation_cancel(const char *session) {
    NSString *value = [NSString stringWithUTF8String:session];
    dispatch_async(dispatch_get_main_queue(), ^{ [controller() cancel:value]; });
}
