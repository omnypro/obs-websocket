import { OBSWebSocket } from './src/index'

// Create OBS client
const obs = new OBSWebSocket({
  logger: {
    info: console.log,
    error: console.error,
  },
})

async function main() {
  try {
    // Connect to OBS (replace with your password if needed)
    await obs.connect('ws://localhost:4455')
    console.log('✅ Connected to OBS')

    // Get version info
    const version = await obs.call('GetVersion')
    console.log(`📺 OBS Version: ${version.obsVersion}`)
    console.log(`🔌 WebSocket Version: ${version.obsWebSocketVersion}`)

    // Get current scene
    const currentScene = await obs.call('GetCurrentProgramScene')
    console.log(`🎬 Current Scene: ${currentScene.sceneName}`)

    // Get all scenes
    const { scenes } = await obs.call('GetSceneList')
    console.log(`📋 Available Scenes:`)
    scenes.forEach((scene) => {
      console.log(`  - ${scene.sceneName}`)
    })

    // Listen to scene changes
    obs.on('CurrentProgramSceneChanged', (data) => {
      console.log(`🔄 Scene changed to: ${data.sceneName}`)
    })

    // Listen to streaming events
    obs.on('StreamStateChanged', (data) => {
      console.log(`📡 Stream ${data.outputActive ? 'started' : 'stopped'}`)
    })

    // Listen to recording events
    obs.on('RecordStateChanged', (data) => {
      if (data.outputActive) {
        console.log(`🔴 Recording started`)
      } else {
        console.log(`⏹️ Recording stopped: ${data.outputPath}`)
      }
    })

    // Get stream status
    const streamStatus = await obs.call('GetStreamStatus')
    console.log(`📊 Streaming: ${streamStatus.outputActive ? 'Yes' : 'No'}`)

    // Example: Change scene (uncomment to test)
    // if (scenes.length > 1) {
    //   const nextScene = scenes.find(s => s.sceneName !== currentScene.sceneName)
    //   if (nextScene) {
    //     await obs.call('SetCurrentProgramScene', { sceneName: nextScene.sceneName })
    //     console.log(`✨ Changed scene to: ${nextScene.sceneName}`)
    //   }
    // }

    // Keep the connection alive to receive events
    console.log('\n👂 Listening for OBS events... (Press Ctrl+C to exit)')

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Disconnecting from OBS...')
      obs.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error('❌ Error:', error)
    obs.disconnect()
    process.exit(1)
  }
}

// Run the example
main()
