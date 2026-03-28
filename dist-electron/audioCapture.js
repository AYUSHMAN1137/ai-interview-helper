"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AudioCaptureService = void 0;
const events_1 = require("events");
/**
 * Audio capture service for mic and system audio loopback.
 * Mic: uses node-record-lpcm16 for microphone capture (16kHz, mono, raw PCM)
 * Speaker: uses naudiodon for WASAPI loopback capture
 */
class AudioCaptureService extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.micStream = null;
        this.loopbackStream = null;
        this.micDataCallback = null;
        this.speakerDataCallback = null;
        this._isMicOn = false;
        this._isSpeakerOn = false;
    }
    get isMicOn() { return this._isMicOn; }
    get isSpeakerOn() { return this._isSpeakerOn; }
    async startMic() {
        if (this._isMicOn)
            return;
        try {
            const record = require('node-record-lpcm16');
            this.micStream = record.record({
                sampleRate: 16000,
                channels: 1,
                audioType: 'raw',
                recorder: 'sox',
            });
            this.micStream.stream().on('data', (chunk) => {
                if (this.micDataCallback) {
                    this.micDataCallback(chunk);
                }
                this.emit('mic-data', chunk);
            });
            this.micStream.stream().on('error', (err) => {
                console.error('Mic stream error:', err);
            });
            this._isMicOn = true;
            console.log('Microphone capture started');
        }
        catch (err) {
            console.error('Failed to start mic capture:', err);
            this._isMicOn = false;
            console.warn('Mic capture unavailable (node-record-lpcm16 or SoX not installed)');
        }
    }
    stopMic() {
        if (this.micStream) {
            try {
                this.micStream.stop();
            }
            catch (e) { /* ignore */ }
            this.micStream = null;
        }
        this._isMicOn = false;
        this.micDataCallback = null;
        console.log('Microphone capture stopped');
    }
    async startLoopback() {
        if (this._isSpeakerOn)
            return;
        try {
            // naudiodon v2+ uses SampleFormatInt16, v1 uses SampleFormat16Bit
            const naudiodon = require('naudiodon');
            const AudioIO = naudiodon.AudioIO;
            const SampleFormat16Bit = naudiodon.SampleFormatInt16 || naudiodon.SampleFormat16Bit;
            this.loopbackStream = new AudioIO({
                inOptions: {
                    channelCount: 1,
                    sampleFormat: SampleFormat16Bit,
                    sampleRate: 16000,
                    deviceId: -1, // Default loopback
                    closeOnError: true,
                },
            });
            this.loopbackStream.on('data', (chunk) => {
                if (this.speakerDataCallback) {
                    this.speakerDataCallback(chunk);
                }
                this.emit('speaker-data', chunk);
            });
            this.loopbackStream.on('error', (err) => {
                console.error('Loopback stream error:', err);
            });
            this.loopbackStream.start();
            this._isSpeakerOn = true;
            console.log('Speaker loopback capture started');
        }
        catch (err) {
            console.error('Failed to start loopback capture:', err);
            this._isSpeakerOn = false;
            console.warn('Speaker capture unavailable (naudiodon not installed)');
        }
    }
    stopLoopback() {
        if (this.loopbackStream) {
            try {
                this.loopbackStream.quit();
            }
            catch (e) { /* ignore */ }
            this.loopbackStream = null;
        }
        this._isSpeakerOn = false;
        this.speakerDataCallback = null;
        console.log('Speaker loopback capture stopped');
    }
    stopAll() {
        this.stopMic();
        this.stopLoopback();
    }
    onMicData(cb) {
        this.micDataCallback = cb;
    }
    onSpeakerData(cb) {
        this.speakerDataCallback = cb;
    }
}
exports.AudioCaptureService = AudioCaptureService;
//# sourceMappingURL=audioCapture.js.map