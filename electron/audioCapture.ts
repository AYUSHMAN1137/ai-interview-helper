import { EventEmitter } from 'events'

/**
 * Audio capture service for mic and system audio loopback.
 * Mic: uses node-record-lpcm16 for microphone capture (16kHz, mono, raw PCM)
 * Speaker: uses naudiodon for WASAPI loopback capture
 */
export class AudioCaptureService extends EventEmitter {
  private micStream: any = null
  private loopbackStream: any = null
  private micDataCallback: ((chunk: Buffer) => void) | null = null
  private speakerDataCallback: ((chunk: Buffer) => void) | null = null
  private _isMicOn = false
  private _isSpeakerOn = false

  get isMicOn() { return this._isMicOn }
  get isSpeakerOn() { return this._isSpeakerOn }

  async startMic(): Promise<void> {
    if (this._isMicOn) return

    try {
      const record = require('node-record-lpcm16')

      this.micStream = record.record({
        sampleRate: 16000,
        channels: 1,
        audioType: 'raw',
        recorder: 'sox',
      })

      this.micStream.stream().on('data', (chunk: Buffer) => {
        if (this.micDataCallback) {
          this.micDataCallback(chunk)
        }
        this.emit('mic-data', chunk)
      })

      this.micStream.stream().on('error', (err: Error) => {
        console.error('Mic stream error:', err)
      })

      this._isMicOn = true
      console.log('Microphone capture started')
    } catch (err) {
      console.error('Failed to start mic capture:', err)
      this._isMicOn = false
      console.warn('Mic capture unavailable (node-record-lpcm16 or SoX not installed)')
    }
  }

  stopMic(): void {
    if (this.micStream) {
      try {
        this.micStream.stop()
      } catch (e) { /* ignore */ }
      this.micStream = null
    }
    this._isMicOn = false
    this.micDataCallback = null
    console.log('Microphone capture stopped')
  }

  async startLoopback(): Promise<void> {
    if (this._isSpeakerOn) return

    try {
      // naudiodon v2+ uses SampleFormatInt16, v1 uses SampleFormat16Bit
      const naudiodon = require('naudiodon')
      const AudioIO = naudiodon.AudioIO
      const SampleFormat16Bit = naudiodon.SampleFormatInt16 || naudiodon.SampleFormat16Bit

      this.loopbackStream = new AudioIO({
        inOptions: {
          channelCount: 1,
          sampleFormat: SampleFormat16Bit,
          sampleRate: 16000,
          deviceId: -1, // Default loopback
          closeOnError: true,
        },
      })

      this.loopbackStream.on('data', (chunk: Buffer) => {
        if (this.speakerDataCallback) {
          this.speakerDataCallback(chunk)
        }
        this.emit('speaker-data', chunk)
      })

      this.loopbackStream.on('error', (err: Error) => {
        console.error('Loopback stream error:', err)
      })

      this.loopbackStream.start()
      this._isSpeakerOn = true
      console.log('Speaker loopback capture started')
    } catch (err) {
      console.error('Failed to start loopback capture:', err)
      this._isSpeakerOn = false
      console.warn('Speaker capture unavailable (naudiodon not installed)')
    }
  }

  stopLoopback(): void {
    if (this.loopbackStream) {
      try {
        this.loopbackStream.quit()
      } catch (e) { /* ignore */ }
      this.loopbackStream = null
    }
    this._isSpeakerOn = false
    this.speakerDataCallback = null
    console.log('Speaker loopback capture stopped')
  }

  stopAll(): void {
    this.stopMic()
    this.stopLoopback()
  }

  onMicData(cb: (chunk: Buffer) => void): void {
    this.micDataCallback = cb
  }

  onSpeakerData(cb: (chunk: Buffer) => void): void {
    this.speakerDataCallback = cb
  }
}
