import type {
  EventMessage,
  HelloMessage,
  IdentifyMessage,
  RequestBatchMessage,
  RequestMessage,
  RequestResponseMessage,
  WebSocketMessage,
} from './types/protocol'
import { EventSubscription, OpCode } from './types/protocol'
import { generateAuth } from './utils/crypto'
import { EventEmitter } from './utils/event-emitter'
import { generateRequestId } from './utils/id'

export interface OBSWebSocketOptions {
  eventSubscriptions?: number
  logger?: {
    debug?: (message: string, ...args: any[]) => void
    info?: (message: string, ...args: any[]) => void
    warn?: (message: string, ...args: any[]) => void
    error?: (message: string, ...args: any[]) => void
  }
}

export class OBSRequestError extends Error {
  constructor(
    public code: number,
    public comment: string,
    public requestType: string
  ) {
    super(`OBS request "${requestType}" failed: ${comment} (code: ${code})`)
    this.name = 'OBSRequestError'
  }
}

export class OBSWebSocket extends EventEmitter {
  private ws: WebSocket | null = null
  private rpcVersion = 1
  private isConnected = false
  private isIdentified = false
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: any) => void
      reject: (error: Error) => void
    }
  >()
  private options: OBSWebSocketOptions
  private reconnectTimer: Timer | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private shouldReconnect = false

  constructor(options: OBSWebSocketOptions = {}) {
    super()
    this.options = {
      eventSubscriptions: EventSubscription.All,
      ...options,
    }
  }

  get connected(): boolean {
    return this.isConnected && this.isIdentified
  }

  async connect(url = 'ws://localhost:4455', password?: string): Promise<void> {
    if (this.ws) {
      throw new Error('Already connected or connecting')
    }

    this.shouldReconnect = true
    this.reconnectDelay = 1000

    return new Promise((resolve, reject) => {
      this.log('debug', 'Connecting to', url)

      // Create WebSocket WITHOUT subprotocol to avoid Bun issue
      this.ws = new WebSocket(url)

      const cleanup = () => {
        this.ws?.removeEventListener('open', onOpen)
        this.ws?.removeEventListener('error', onError)
        this.ws?.removeEventListener('close', onClose)
      }

      const onOpen = () => {
        this.log('debug', 'WebSocket connected')
        this.isConnected = true
        cleanup()
      }

      const onError = (error: Event) => {
        this.log('error', 'Connection error:', error)
        cleanup()
        reject(new Error('Failed to connect to OBS WebSocket'))
      }

      const onClose = () => {
        cleanup()
        reject(new Error('Connection closed before establishing'))
      }

      this.once('obs:Hello', async (hello: HelloMessage) => {
        try {
          await this.identify(hello, password)
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      this.ws.addEventListener('message', this.handleMessage.bind(this))
      this.ws.addEventListener('open', onOpen)
      this.ws.addEventListener('close', this.handleClose.bind(this))
      this.ws.addEventListener('error', this.handleError.bind(this))
    })
  }

  disconnect(): void {
    this.shouldReconnect = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.isConnected = false
    this.isIdentified = false

    // Reject all pending requests
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()

    this.emit('ConnectionClosed', { code: 1000, reason: 'Client disconnect' })
  }

  async call<T = any>(requestType: string, requestData?: Record<string, any>): Promise<T> {
    if (!this.connected) {
      throw new Error('Not connected to OBS WebSocket')
    }

    const requestId = generateRequestId()
    const message: RequestMessage = {
      op: OpCode.Request,
      d: {
        requestType,
        requestId,
        requestData,
      },
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject })
      this.send(message)
    })
  }

  async callBatch(
    requests: Array<{
      requestType: string
      requestData?: Record<string, any>
    }>,
    options?: {
      haltOnFailure?: boolean
      executionType?: number
    }
  ): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Not connected to OBS WebSocket')
    }

    const requestId = generateRequestId()
    const message: RequestBatchMessage = {
      op: OpCode.RequestBatch,
      d: {
        requestId,
        haltOnFailure: options?.haltOnFailure,
        executionType: options?.executionType,
        requests: requests.map((req) => ({
          requestType: req.requestType,
          requestId: generateRequestId(),
          requestData: req.requestData,
        })),
      },
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject })
      this.send(message)
    })
  }

  reidentify(eventSubscriptions?: number): void {
    if (!this.connected) {
      throw new Error('Not connected to OBS WebSocket')
    }

    this.send({
      op: OpCode.Reidentify,
      d: {
        eventSubscriptions: eventSubscriptions ?? this.options.eventSubscriptions,
      },
    })
  }

  private async identify(hello: HelloMessage, password?: string): Promise<void> {
    const message: IdentifyMessage = {
      op: OpCode.Identify,
      d: {
        rpcVersion: hello.d.rpcVersion,
        eventSubscriptions: this.options.eventSubscriptions,
      },
    }

    if (hello.d.authentication && password) {
      message.d.authentication = await generateAuth(
        password,
        hello.d.authentication.salt,
        hello.d.authentication.challenge
      )
    } else if (hello.d.authentication && !password) {
      throw new Error('Server requires authentication but no password provided')
    }

    return new Promise((resolve, reject) => {
      this.once('obs:Identified', (identified) => {
        this.isIdentified = true
        this.emit('Identified', identified.d)
        this.emit('ConnectionOpened')
        resolve()
      })

      this.once('obs:error', (error) => {
        reject(error)
      })

      this.send(message)
    })
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data)
      this.log('debug', 'Received message:', message.op)

      switch (message.op) {
        case OpCode.Hello:
          this.emit('obs:Hello', message)
          break

        case OpCode.Identified:
          this.rpcVersion = message.d.negotiatedRpcVersion
          this.emit('obs:Identified', message)
          break

        case OpCode.Event:
          this.handleEvent(message as EventMessage)
          break

        case OpCode.RequestResponse:
          this.handleRequestResponse(message as RequestResponseMessage)
          break

        case OpCode.RequestBatchResponse:
          this.handleBatchResponse(message)
          break

        default:
          this.log('warn', 'Unknown message opcode:', message.op)
      }
    } catch (error) {
      this.log('error', 'Failed to parse message:', error)
      this.emit('obs:error', error)
    }
  }

  private handleEvent(message: EventMessage): void {
    const { eventType, eventData } = message.d
    this.log('debug', 'Event received:', eventType)
    this.emit(eventType, eventData)
  }

  private handleRequestResponse(message: RequestResponseMessage): void {
    const { requestId, requestStatus, responseData } = message.d
    const pending = this.pendingRequests.get(requestId)

    if (!pending) {
      this.log('warn', 'Received response for unknown request:', requestId)
      return
    }

    this.pendingRequests.delete(requestId)

    if (requestStatus.result) {
      pending.resolve(responseData)
    } else {
      pending.reject(
        new OBSRequestError(
          requestStatus.code,
          requestStatus.comment || 'Unknown error',
          message.d.requestType
        )
      )
    }
  }

  private handleBatchResponse(message: any): void {
    const { requestId, results } = message.d
    const pending = this.pendingRequests.get(requestId)

    if (!pending) {
      this.log('warn', 'Received batch response for unknown request:', requestId)
      return
    }

    this.pendingRequests.delete(requestId)

    try {
      const responses = results.map((result: any) => {
        if (result.requestStatus.result) {
          return result.responseData
        } else {
          throw new OBSRequestError(
            result.requestStatus.code,
            result.requestStatus.comment || 'Unknown error',
            result.requestType
          )
        }
      })

      pending.resolve(responses)
    } catch (error) {
      pending.reject(error as Error)
    }
  }

  private handleClose(event: CloseEvent): void {
    this.log('info', 'WebSocket closed:', event.code, event.reason)
    this.isConnected = false
    this.isIdentified = false
    this.ws = null

    // Reject all pending requests
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()

    this.emit('ConnectionClosed', { code: event.code, reason: event.reason })

    // Handle reconnection
    if (this.shouldReconnect && event.code !== 1000) {
      this.scheduleReconnect()
    }
  }

  private handleError(event: Event): void {
    this.log('error', 'WebSocket error:', event)
    this.emit('obs:error', new Error('WebSocket error'))
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.log('info', `Reconnecting in ${this.reconnectDelay}ms...`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.emit('Reconnecting')

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)

      // Attempt reconnection
      // Note: We don't have the original URL/password stored, so emit an event
      this.emit('obs:reconnect')
    }, this.reconnectDelay)
  }

  private send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    const data = JSON.stringify(message)
    this.log('debug', 'Sending message:', message.op)
    this.ws.send(data)
  }

  private log(
    level: keyof NonNullable<OBSWebSocketOptions['logger']>,
    message: string,
    ...args: any[]
  ): void {
    const logger = this.options.logger?.[level]
    if (logger) {
      logger(message, ...args)
    }
  }
}
