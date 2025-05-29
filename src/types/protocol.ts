export interface OpCode {
  Hello: 0
  Identify: 1
  Identified: 2
  Reidentify: 3
  Event: 5
  Request: 6
  RequestResponse: 7
  RequestBatch: 8
  RequestBatchResponse: 9
}

export const OpCode: OpCode = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Reidentify: 3,
  Event: 5,
  Request: 6,
  RequestResponse: 7,
  RequestBatch: 8,
  RequestBatchResponse: 9,
}

export interface HelloMessage {
  op: 0
  d: {
    obsWebSocketVersion: string
    rpcVersion: number
    authentication?: {
      challenge: string
      salt: string
    }
  }
}

export interface IdentifyMessage {
  op: 1
  d: {
    rpcVersion: number
    authentication?: string
    eventSubscriptions?: number
  }
}

export interface IdentifiedMessage {
  op: 2
  d: {
    negotiatedRpcVersion: number
  }
}

export interface ReidentifyMessage {
  op: 3
  d: {
    eventSubscriptions?: number
  }
}

export interface EventMessage {
  op: 5
  d: {
    eventType: string
    eventIntent: number
    eventData: Record<string, any>
  }
}

export interface RequestMessage {
  op: 6
  d: {
    requestType: string
    requestId: string
    requestData?: Record<string, any>
  }
}

export interface RequestResponseMessage {
  op: 7
  d: {
    requestType: string
    requestId: string
    requestStatus: {
      result: boolean
      code: number
      comment?: string
    }
    responseData?: Record<string, any>
  }
}

export interface RequestBatchMessage {
  op: 8
  d: {
    requestId: string
    haltOnFailure?: boolean
    executionType?: number
    requests: Array<{
      requestType: string
      requestId?: string
      requestData?: Record<string, any>
    }>
  }
}

export interface RequestBatchResponseMessage {
  op: 9
  d: {
    requestId: string
    results: Array<{
      requestType: string
      requestStatus: {
        result: boolean
        code: number
        comment?: string
      }
      responseData?: Record<string, any>
    }>
  }
}

export type WebSocketMessage =
  | HelloMessage
  | IdentifyMessage
  | IdentifiedMessage
  | ReidentifyMessage
  | EventMessage
  | RequestMessage
  | RequestResponseMessage
  | RequestBatchMessage
  | RequestBatchResponseMessage

export const EventSubscription = {
  None: 0,
  General: 1 << 0,
  Config: 1 << 1,
  Scenes: 1 << 2,
  Inputs: 1 << 3,
  Transitions: 1 << 4,
  Filters: 1 << 5,
  Outputs: 1 << 6,
  SceneItems: 1 << 7,
  MediaInputs: 1 << 8,
  Vendors: 1 << 9,
  Ui: 1 << 10,
  All: (1 << 11) - 1,
  InputVolumeMeters: 1 << 16,
  InputActiveStateChanged: 1 << 17,
  InputShowStateChanged: 1 << 18,
  SceneItemTransformChanged: 1 << 19,
} as const

export enum RequestStatus {
  Unknown = 0,
  NoError = 10,
  Success = 100,
  MissingRequestType = 203,
  UnknownRequestType = 204,
  GenericError = 205,
  UnsupportedRequestBatchExecutionType = 206,
  NotReady = 207,
  MissingRequestField = 300,
  MissingRequestData = 301,
  InvalidRequestField = 400,
  InvalidRequestFieldType = 401,
  RequestFieldOutOfRange = 402,
  RequestFieldEmpty = 403,
  TooManyRequestFields = 404,
  OutputRunning = 500,
  OutputNotRunning = 501,
  OutputPaused = 502,
  OutputNotPaused = 503,
  OutputDisabled = 504,
  StudioModeActive = 505,
  StudioModeNotActive = 506,
  ResourceNotFound = 600,
  ResourceAlreadyExists = 601,
  InvalidResourceType = 602,
  NotEnoughResources = 603,
  InvalidResourceState = 604,
  InvalidInputKind = 605,
  ResourceNotConfigurable = 606,
  InvalidFilterKind = 607,
  ResourceCreationFailed = 700,
  ResourceActionFailed = 701,
  RequestProcessingFailed = 702,
  CannotAct = 703,
}
