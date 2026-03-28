import { EventEmitter } from 'events'

/**
 * STT Engine using Deepgram real-time WebSocket API.
 * Uses TWO separate connections: one for mic (Candidate) and one for speaker loopback (Interviewer).
 * Connections are created ON-DEMAND when mic/speaker are enabled (avoids timeout).
 */
export class STTEngine extends EventEmitter {
  private apiKey: string
  private micConnection: any = null
  private speakerConnection: any = null
  private isMicConnected = false
  private isSpeakerConnected = false
  private keepAliveIntervals: Map<string, NodeJS.Timeout> = new Map()

  constructor(apiKey: string) {
    super()
    this.apiKey = apiKey
  }

  /** Called at startup — just validates key, does NOT connect yet */
  async connect(): Promise<void> {
    if (!this.apiKey || this.apiKey === 'your_deepgram_api_key_here') {
      console.warn('Deepgram API key not configured — STT disabled')
      return
    }
    console.log('Deepgram API key configured — will connect when mic/speaker enabled')
  }

  /** Connect a specific source ON-DEMAND (when user enables mic or speaker) */
  async connectSource(source: 'mic' | 'speaker'): Promise<boolean> {
    if (!this.apiKey || this.apiKey === 'your_deepgram_api_key_here') {
      console.warn(`Cannot connect ${source}: Deepgram API key not configured`)
      return false
    }

    // Disconnect existing connection first
    this.disconnectSource(source)

    try {
      const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk')
      const deepgram = createClient(this.apiKey)
      const speaker = source === 'mic' ? 'Candidate' : 'Interviewer'

      console.log(`Connecting Deepgram ${source}...`)

      const connection = deepgram.listen.live({
        model: 'nova-2',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 3000,   // 3 seconds silence before finalizing (prevents fragmentation on short pauses)
        endpointing: 800,         // 800ms of silence before end-of-speech detection
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      })

      return new Promise((resolve) => {
        let opened = false

        connection.on(LiveTranscriptionEvents.Open, () => {
          if (source === 'mic') this.isMicConnected = true
          else this.isSpeakerConnected = true
          opened = true
          console.log(`✓ Deepgram ${source} connection opened`)

          // Send keepAlive every 8 seconds to prevent timeout
          const interval = setInterval(() => {
            try {
              if (connection && ((source === 'mic' && this.isMicConnected) || (source === 'speaker' && this.isSpeakerConnected))) {
                connection.keepAlive()
              }
            } catch (e) { /* ignore */ }
          }, 8000)
          this.keepAliveIntervals.set(source, interval)

          resolve(true)
        })

        connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
          const alt = data.channel?.alternatives?.[0]
          if (!alt || !alt.transcript) return

          const transcript = alt.transcript.trim()
          if (!transcript) return

          const isFinal = data.is_final || false

          this.emit('transcript', {
            id: `t_${Date.now()}_${source}`,
            speaker,
            text: transcript,
            isFinal,
            timestamp: new Date().toISOString(),
          })
        })

        connection.on(LiveTranscriptionEvents.Error, (err: any) => {
          console.error(`Deepgram ${source} error:`, err)
          if (source === 'mic') this.isMicConnected = false
          else this.isSpeakerConnected = false
          if (!opened) resolve(false)
        })

        connection.on(LiveTranscriptionEvents.Close, () => {
          if (source === 'mic') this.isMicConnected = false
          else this.isSpeakerConnected = false
          console.log(`Deepgram ${source} connection closed`)
          // Clear keepAlive
          const interval = this.keepAliveIntervals.get(source)
          if (interval) { clearInterval(interval); this.keepAliveIntervals.delete(source) }
        })

        if (source === 'mic') this.micConnection = connection
        else this.speakerConnection = connection

        // Timeout: if connection doesn't open in 10s, resolve false
        setTimeout(() => { if (!opened) resolve(false) }, 10000)
      })
    } catch (err) {
      console.error(`Failed to connect Deepgram ${source}:`, err)
      return false
    }
  }

  /** Disconnect a specific source (when user disables mic or speaker) */
  disconnectSource(source: 'mic' | 'speaker'): void {
    const conn = source === 'mic' ? this.micConnection : this.speakerConnection
    if (conn) {
      try { conn.finish() } catch (e) { /* ignore */ }
    }
    if (source === 'mic') { this.micConnection = null; this.isMicConnected = false }
    else { this.speakerConnection = null; this.isSpeakerConnected = false }

    const interval = this.keepAliveIntervals.get(source)
    if (interval) { clearInterval(interval); this.keepAliveIntervals.delete(source) }
  }

  sendAudio(chunk: Buffer | Uint8Array, source: 'mic' | 'speaker'): void {
    const connection = source === 'mic' ? this.micConnection : this.speakerConnection
    const isConnected = source === 'mic' ? this.isMicConnected : this.isSpeakerConnected

    if (connection && isConnected) {
      try {
        // Ensure we send a proper Buffer (IPC may deliver Uint8Array)
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        connection.send(buf)
      } catch (err) {
        console.error(`Error sending ${source} audio to Deepgram:`, err)
      }
    }
  }

  updateApiKey(key: string): void {
    this.apiKey = key
    this.close()
  }

  close(): void {
    this.disconnectSource('mic')
    this.disconnectSource('speaker')
  }
}
