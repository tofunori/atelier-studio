#include "dictation_meter.h"
#include <assert.h>
#include <stdio.h>

int main(void) {
    // The same quiet/voice contrast must work across microphone gain settings.
    const float gains[] = {0.0005f, 0.005f, 0.025f};
    for (unsigned int gain = 0; gain < 3; gain++) {
        AtelierDictationMeter meter = {0};
        float room = gains[gain];
        for (int i = 0; i < 36; i++) {
            float jitter = i % 2 ? 1.15f : 0.9f;
            assert(atelier_dictation_meter_level(&meter, room * jitter) == 0);
        }
        for (int i = 0; i < 720; i++) {
            float voice = atelier_dictation_meter_level(&meter, room * 5);
            assert(voice > 0.4f && voice <= 1);
        }
        for (int i = 0; i < 24; i++)
            assert(atelier_dictation_meter_level(&meter, room) == 0);
        assert(atelier_dictation_meter_level(&meter, 0) == 0);
        assert(atelier_dictation_meter_level(&meter, NAN) == 0);
        assert(atelier_dictation_meter_level(&meter, INFINITY) == 0);
    }
    AtelierDictationMeter immediate = {0};
    for (int i = 0; i < 12; i++) atelier_dictation_meter_level(&immediate, 0.0025f);
    atelier_dictation_meter_speech(&immediate);
    for (int i = 0; i < 720; i++)
        assert(atelier_dictation_meter_level(&immediate, 0.0025f) > 0.4f);

    AtelierDictationMeter digitalSilence = {0};
    for (int i = 0; i < 36; i++) assert(atelier_dictation_meter_level(&digitalSilence, 0) == 0);
    for (int i = 0; i < 720; i++) assert(atelier_dictation_meter_level(&digitalSilence, 0.0005f) == 0);
    assert(atelier_dictation_meter_level(&digitalSilence, 0.0025f) > 0.4f);

    AtelierDictationMeter immediateAfterZeros = {0};
    for (int i = 0; i < 36; i++) atelier_dictation_meter_level(&immediateAfterZeros, 0);
    for (int i = 0; i < 12; i++) atelier_dictation_meter_level(&immediateAfterZeros, 0.0025f);
    atelier_dictation_meter_speech(&immediateAfterZeros);
    assert(atelier_dictation_meter_level(&immediateAfterZeros, 0.0025f) > 0.4f);

    AtelierDictationMeter endedSpeech = {0};
    for (int i = 0; i < 12; i++) atelier_dictation_meter_level(&endedSpeech, 0.0025f);
    atelier_dictation_meter_speech(&endedSpeech);
    for (int i = 0; i < 12; i++) assert(atelier_dictation_meter_level(&endedSpeech, 0) == 0);
    assert(endedSpeech.speechHintTicks == 0);
    puts("dictation meter: quiet, soft speech, sustained speech and gain checks passed");
}
