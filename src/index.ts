export { OBSWebSocket, OBSRequestError } from './obs-websocket'
export type { OBSWebSocketOptions } from './obs-websocket'

// Export protocol types
export {
  OpCode,
  EventSubscription,
  RequestStatus,
} from './types/protocol'

export type {
  WebSocketMessage,
  HelloMessage,
  IdentifyMessage,
  IdentifiedMessage,
  ReidentifyMessage,
  EventMessage,
  RequestMessage,
  RequestResponseMessage,
  RequestBatchMessage,
  RequestBatchResponseMessage,
} from './types/protocol'

// Re-export common request/response types for convenience
export interface OBSResponseTypes {
  // General
  GetVersion: {
    obsVersion: string
    obsWebSocketVersion: string
    rpcVersion: number
    availableRequests: string[]
    supportedImageFormats: string[]
    platform: string
    platformDescription: string
  }
  GetStats: {
    cpuUsage: number
    memoryUsage: number
    availableMemory: number
    activeFps: number
    averageFrameRenderTime: number
    renderSkippedFrames: number
    renderTotalFrames: number
    outputSkippedFrames: number
    outputTotalFrames: number
    webSocketSessionIncomingMessages: number
    webSocketSessionOutgoingMessages: number
  }

  // Scenes
  GetSceneList: {
    currentProgramSceneName: string
    currentPreviewSceneName?: string
    scenes: Array<{
      sceneName: string
      sceneIndex: number
    }>
  }
  GetCurrentProgramScene: {
    sceneName: string
    sceneUuid: string
  }
  SetCurrentProgramScene: void

  // Sources
  GetInputList: {
    inputs: Array<{
      inputName: string
      inputUuid: string
      inputKind: string
      unversionedInputKind: string
    }>
  }
  GetInputSettings: {
    inputSettings: Record<string, any>
    inputKind: string
  }
  SetInputSettings: void

  // Streaming
  GetStreamStatus: {
    outputActive: boolean
    outputReconnecting: boolean
    outputTimecode: string
    outputDuration: number
    outputCongestion: number
    outputBytes: number
    outputSkippedFrames: number
    outputTotalFrames: number
  }
  StartStream: void
  StopStream: void

  // Recording
  GetRecordStatus: {
    outputActive: boolean
    outputPaused: boolean
    outputTimecode: string
    outputDuration: number
    outputBytes: number
  }
  StartRecord: void
  StopRecord: void
  PauseRecord: void
  ResumeRecord: void
}

// Common event data types
export interface OBSEventTypes {
  // General Events
  ExitStarted: void

  // Config Events
  CurrentSceneCollectionChanging: { sceneCollectionName: string }
  CurrentSceneCollectionChanged: { sceneCollectionName: string }
  SceneCollectionListChanged: { sceneCollections: string[] }
  CurrentProfileChanging: { profileName: string }
  CurrentProfileChanged: { profileName: string }
  ProfileListChanged: { profiles: string[] }

  // Scenes Events
  SceneCreated: { sceneName: string; sceneUuid: string; isGroup: boolean }
  SceneRemoved: { sceneName: string; sceneUuid: string; isGroup: boolean }
  SceneNameChanged: { sceneUuid: string; oldSceneName: string; sceneName: string }
  CurrentProgramSceneChanged: { sceneName: string; sceneUuid: string }
  CurrentPreviewSceneChanged: { sceneName: string; sceneUuid: string }
  SceneListChanged: { scenes: Array<{ sceneName: string; sceneUuid: string }> }

  // Inputs Events
  InputCreated: {
    inputName: string
    inputUuid: string
    inputKind: string
    inputSettings: Record<string, any>
  }
  InputRemoved: { inputName: string; inputUuid: string }
  InputNameChanged: { inputUuid: string; oldInputName: string; inputName: string }
  InputSettingsChanged: { inputName: string; inputUuid: string; inputSettings: Record<string, any> }

  // Transitions Events
  CurrentSceneTransitionChanged: { transitionName: string; transitionUuid: string }
  CurrentSceneTransitionDurationChanged: { transitionDuration: number }
  SceneTransitionStarted: { transitionName: string; transitionUuid: string }
  SceneTransitionEnded: { transitionName: string; transitionUuid: string }

  // Outputs Events
  StreamStateChanged: { outputActive: boolean; outputState: string }
  RecordStateChanged: { outputActive: boolean; outputState: string; outputPath?: string }
  ReplayBufferStateChanged: { outputActive: boolean; outputState: string }
  VirtualcamStateChanged: { outputActive: boolean; outputState: string }

  // Media Inputs Events
  MediaInputPlaybackStarted: { inputName: string; inputUuid: string }
  MediaInputPlaybackEnded: { inputName: string; inputUuid: string }
  MediaInputActionTriggered: { inputName: string; inputUuid: string; mediaAction: string }
}
