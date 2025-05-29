# @omnypro/obs-websocket

A modern OBS WebSocket client library built specifically for Bun runtime compatibility.

## Why This Library Exists

The popular `obs-websocket-js` library has a fundamental incompatibility with Bun's WebSocket implementation regarding subprotocols, causing "Server sent no subprotocol" errors. This library solves that issue by avoiding subprotocol negotiation entirely.

**Note:** This is a Bun-specific compatibility issue tracked at [oven-sh/bun#10459](https://github.com/oven-sh/bun/issues/10459). Once resolved, you should use the official `obs-websocket-js` library instead.

## Installation

```bash
bun add @omnypro/obs-websocket
```

## Quick Start

```typescript
import { OBSWebSocket } from '@omnypro/obs-websocket'

// Create a new instance
const obs = new OBSWebSocket()

// Connect to OBS
await obs.connect('ws://localhost:4455', 'your-password')

// Make requests
const { obsVersion } = await obs.call('GetVersion')
console.log(`Connected to OBS ${obsVersion}`)

// Listen to events
obs.on('CurrentProgramSceneChanged', (data) => {
  console.log(`Scene changed to: ${data.sceneName}`)
})

// Change scene
await obs.call('SetCurrentProgramScene', { sceneName: 'Game Scene' })

// Disconnect when done
obs.disconnect()
```

## API Reference

### Connection

```typescript
// Connect with default options
await obs.connect()

// Connect with custom URL and password
await obs.connect('ws://192.168.1.100:4455', 'password123')

// Disconnect
obs.disconnect()

// Check connection status
if (obs.connected) {
  console.log('Connected to OBS')
}
```

### Making Requests

```typescript
// Simple request
const version = await obs.call('GetVersion')

// Request with parameters
await obs.call('SetCurrentProgramScene', { 
  sceneName: 'My Scene' 
})

// Batch requests
const [version, stats] = await obs.callBatch([
  { requestType: 'GetVersion' },
  { requestType: 'GetStats' }
])

// Batch with options
const results = await obs.callBatch([
  { requestType: 'StartStream' },
  { requestType: 'StartRecord' }
], {
  haltOnFailure: false // Continue even if one fails
})
```

### Events

```typescript
// Listen to events
obs.on('StreamStateChanged', ({ outputActive }) => {
  console.log(`Streaming: ${outputActive}`)
})

// One-time listener
obs.once('RecordStateChanged', ({ outputActive }) => {
  console.log(`Recording started: ${outputActive}`)
})

// Remove listener
const handler = (data) => console.log(data)
obs.on('InputCreated', handler)
obs.off('InputCreated', handler)

// Remove all listeners for an event
obs.removeAllListeners('InputCreated')

// Remove all listeners
obs.removeAllListeners()
```

### Event Subscriptions

Control which events you receive to reduce bandwidth:

```typescript
import { OBSWebSocket, EventSubscription } from '@omnypro/obs-websocket'

const obs = new OBSWebSocket({
  eventSubscriptions: 
    EventSubscription.Scenes | 
    EventSubscription.Inputs
})

// Or use predefined combinations
const obs = new OBSWebSocket({
  eventSubscriptions: EventSubscription.All // Default
})

// Change subscriptions after connecting
obs.reidentify(EventSubscription.None) // Disable all events
```

### Error Handling

```typescript
import { OBSRequestError } from '@omnypro/obs-websocket'

try {
  await obs.call('SetCurrentProgramScene', { 
    sceneName: 'Non-existent Scene' 
  })
} catch (error) {
  if (error instanceof OBSRequestError) {
    console.error(`Request failed: ${error.comment}`)
    console.error(`Error code: ${error.code}`)
    console.error(`Request type: ${error.requestType}`)
  }
}
```

### Logging

```typescript
const obs = new OBSWebSocket({
  logger: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
})
```

## Common Use Cases

### Scene Management

```typescript
// Get all scenes
const { scenes, currentProgramSceneName } = await obs.call('GetSceneList')

// Create a scene
await obs.call('CreateScene', { sceneName: 'New Scene' })

// Switch scenes with transition
await obs.call('SetCurrentProgramScene', { sceneName: 'Game Scene' })

// Get current scene
const { sceneName } = await obs.call('GetCurrentProgramScene')
```

### Streaming Control

```typescript
// Get stream status
const { outputActive, outputDuration } = await obs.call('GetStreamStatus')

// Start streaming
await obs.call('StartStream')

// Stop streaming
await obs.call('StopStream')

// Monitor stream health
obs.on('StreamStateChanged', ({ outputActive, outputState }) => {
  console.log(`Stream ${outputActive ? 'started' : 'stopped'}: ${outputState}`)
})
```

### Recording Control

```typescript
// Start recording
await obs.call('StartRecord')

// Pause/resume recording
await obs.call('PauseRecord')
await obs.call('ResumeRecord')

// Stop recording
const { outputPath } = await obs.call('StopRecord')
console.log(`Recording saved to: ${outputPath}`)
```

### Input/Source Management

```typescript
// Get all inputs
const { inputs } = await obs.call('GetInputList')

// Get input settings
const { inputSettings } = await obs.call('GetInputSettings', {
  inputName: 'Webcam'
})

// Update input settings
await obs.call('SetInputSettings', {
  inputName: 'Webcam',
  inputSettings: {
    device_id: 'new-device-id'
  }
})

// Toggle input visibility
await obs.call('SetSceneItemEnabled', {
  sceneName: 'Main Scene',
  sceneItemId: 123,
  sceneItemEnabled: false
})
```

### Audio Control

```typescript
// Set input volume
await obs.call('SetInputVolume', {
  inputName: 'Microphone',
  inputVolumeDb: -10.5 // in dB
})

// Mute/unmute input
await obs.call('SetInputMute', {
  inputName: 'Microphone',
  inputMuted: true
})

// Monitor audio levels
obs.on('InputVolumeMeters', (data) => {
  data.inputs.forEach(input => {
    console.log(`${input.inputName}: ${input.inputLevelsMul}`)
  })
})
```

## Advanced Features

### Auto-Reconnection

The library includes automatic reconnection with exponential backoff:

```typescript
// Listen to reconnection events
obs.on('ConnectionClosed', ({ code, reason }) => {
  console.log(`Disconnected: ${reason} (${code})`)
})

obs.on('Reconnecting', () => {
  console.log('Attempting to reconnect...')
})

obs.on('ConnectionOpened', () => {
  console.log('Reconnected successfully!')
})

// Disable auto-reconnect by disconnecting manually
obs.disconnect() // This won't auto-reconnect
```

### Request Timeouts

While the library doesn't have built-in request timeouts, you can implement them:

```typescript
const timeoutPromise = (ms: number) => 
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timeout')), ms)
  )

try {
  const result = await Promise.race([
    obs.call('GetVersion'),
    timeoutPromise(5000)
  ])
} catch (error) {
  console.error('Request timed out or failed')
}
```

## Migration from obs-websocket-js

The APIs are nearly identical, making migration straightforward:

```typescript
// obs-websocket-js
import OBSWebSocket from 'obs-websocket-js'
const obs = new OBSWebSocket()
await obs.connect('ws://localhost:4455', 'password')
const { scenes } = await obs.call('GetSceneList')

// @omnypro/obs-websocket
import { OBSWebSocket } from '@omnypro/obs-websocket'
const obs = new OBSWebSocket()
await obs.connect('ws://localhost:4455', 'password')
const { scenes } = await obs.call('GetSceneList')
```

Key differences:
- **Event subscriptions**: Set in constructor options rather than connect's third parameter
- **No msgpack option**: JSON-only for simplicity
- **Import style**: Named export vs default export
- **Main benefit**: Works with Bun without subprotocol errors

## TypeScript Support

All requests and events are fully typed:

```typescript
import type { OBSResponseTypes, OBSEventTypes } from '@omnypro/obs-websocket'

// Response types
const response: OBSResponseTypes['GetSceneList'] = 
  await obs.call('GetSceneList')

// Event types
obs.on<OBSEventTypes['CurrentProgramSceneChanged']>(
  'CurrentProgramSceneChanged', 
  (data) => {
    // data is fully typed
    console.log(data.sceneName)
  }
)
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © Omnyist Productions

## Acknowledgments

- Protocol implementation based on [OBS WebSocket Protocol v5.x](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
- Inspired by [obs-websocket-js](https://github.com/obs-websocket-community-projects/obs-websocket-js) but built from scratch for Bun compatibility
