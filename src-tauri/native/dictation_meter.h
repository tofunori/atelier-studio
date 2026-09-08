#ifndef ATELIER_DICTATION_METER_H
#define ATELIER_DICTATION_METER_H
#include <math.h>

typedef struct {
    float noiseFloor;
    unsigned int samples;
    float recent[12];
    unsigned int cursor;
    float peakLevel;
    unsigned int speechHintTicks;
    unsigned int speechHintUsed;
    unsigned int hasSignal;
} AtelierDictationMeter;

// A real recognition result can rescue calibration begun while already talking.
// It changes the gain once, never supplies or invents an audio amplitude.
static inline void atelier_dictation_meter_speech(AtelierDictationMeter *meter) {
    if (meter->peakLevel == 0 && !meter->speechHintUsed) {
        meter->speechHintTicks = 6;
        meter->speechHintUsed = 1;
    }
}

// Called at 12 Hz. Learn the room level briefly, then follow quieter passages
// quickly and rising background slowly so speech does not become the baseline.
static inline float atelier_dictation_meter_level(AtelierDictationMeter *meter, float rms) {
    if (!isfinite(rms) || rms < 0) return 0;
    meter->recent[meter->cursor] = rms;
    meter->cursor = (meter->cursor + 1) % 12;
    float reference = fmaxf(rms, 0.000001f);
    if (meter->samples == 0) meter->noiseFloor = reference;
    if (!meter->hasSignal && rms > 0.000001f) {
        meter->noiseFloor = rms;
        meter->hasSignal = 1;
    }
    if (meter->samples < 3) {
        if (rms > 0.000001f) meter->noiseFloor = fminf(meter->noiseFloor, reference);
        meter->samples++;
        return 0;
    }
    if (meter->speechHintTicks) {
        meter->speechHintTicks--;
        float peak = 0;
        for (unsigned int i = 0; i < 12; i++) peak = fmaxf(peak, meter->recent[i]);
        if (peak > 0.000001f && rms >= peak * 0.70710678f) {
            meter->noiseFloor = fminf(meter->noiseFloor, peak / 4);
            meter->speechHintTicks = 0;
        }
    }
    if (rms <= 0.000001f) return 0;
    float rate = rms < meter->noiseFloor ? 0.3f
        : rms < meter->noiseFloor * 2 ? 0.002f : 0;
    meter->noiseFloor += rate * (rms - meter->noiseFloor);
    float aboveNoise = 20 * log10f(rms / fmaxf(meter->noiseFloor, 0.000001f));
    // Room fluctuations below 6 dB remain dots. Expand soft speech visually.
    float level = sqrtf(fminf(1, fmaxf(0, (aboveNoise - 6) / 18)));
    meter->peakLevel = fmaxf(meter->peakLevel, level);
    return level;
}
#endif
