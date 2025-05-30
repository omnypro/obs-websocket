import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { OBSWebSocket, OBSRequestError } from './obs-websocket'
import { OpCode, EventSubscription, RequestStatus } from './types/protocol'
import { generateAuth } from './utils/crypto'

describe('OBS WebSocket Protocol v5.x Compliance', () => {
  let obs: OBSWebSocket
  let mockWebSocket: any

  beforeEach(() => {
    obs = new OBSWebSocket()
    
    global.WebSocket = mock((url: string) => {
      mockWebSocket = {
        url,
        readyState: WebSocket.CONNECTING,
        send: mock(),
        close: mock(),
        addEventListener: mock(),
        removeEventListener: mock(),
      }
      
      setTimeout(() => {
        mockWebSocket.readyState = WebSocket.OPEN
        const openEvent = new Event('open')
        mockWebSocket.addEventListener.mock.calls
          .filter(([event]: any) => event === 'open')
          .forEach(([, handler]: any) => handler(openEvent))
      }, 0)
      
      return mockWebSocket
    }) as any
  })

  describe('Connection Handshake', () => {
    test('handles Hello message without authentication', async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends Hello without auth
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
          },
        }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))

      // Check that Identify was sent without auth
      const identifyCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.Identify
      })
      
      expect(identifyCall).toBeDefined()
      const identifyMsg = JSON.parse(identifyCall[0])
      expect(identifyMsg.op).toBe(OpCode.Identify)
      expect(identifyMsg.d.rpcVersion).toBe(1)
      expect(identifyMsg.d.authentication).toBeUndefined()
      expect(identifyMsg.d.eventSubscriptions).toBe(EventSubscription.All)
    })

    test('handles Hello message with authentication', async () => {
      const connectPromise = obs.connect('ws://localhost:4455', 'testpassword')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      const challenge = '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY='
      const salt = 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI='

      // Server sends Hello with auth
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
            authentication: {
              challenge,
              salt,
            },
          },
        }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))

      // Check that Identify was sent with auth
      const identifyCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.Identify
      })
      
      expect(identifyCall).toBeDefined()
      const identifyMsg = JSON.parse(identifyCall[0])
      expect(identifyMsg.op).toBe(OpCode.Identify)
      expect(identifyMsg.d.rpcVersion).toBe(1)
      expect(identifyMsg.d.authentication).toBeDefined()
      
      // Verify auth string was generated correctly
      const expectedAuth = await generateAuth('testpassword', salt, challenge)
      expect(identifyMsg.d.authentication).toBe(expectedAuth)
    })

    test('fails when server requires auth but no password provided', async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends Hello with auth required
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
            authentication: {
              challenge: 'challenge',
              salt: 'salt',
            },
          },
        }),
      })

      await expect(connectPromise).rejects.toThrow('Server requires authentication but no password provided')
    })

    test('handles Identified message correctly', async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends Hello
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
          },
        }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))

      // Server sends Identified
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: {
            negotiatedRpcVersion: 1,
          },
        }),
      })

      await connectPromise
      expect(obs.connected).toBe(true)
    })

    test('handles custom event subscriptions', async () => {
      const customObs = new OBSWebSocket({
        eventSubscriptions: EventSubscription.Scenes | EventSubscription.Inputs,
      })
      
      const connectPromise = customObs.connect('ws://localhost:4455')
      
      const customMessageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends Hello
      customMessageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: {
            obsStudioVersion: '30.2.2',
            obsWebSocketVersion: '5.5.2',
            rpcVersion: 1,
          },
        }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))

      // Check that Identify was sent with custom event subscriptions
      const identifyCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.Identify
      })
      
      const identifyMsg = JSON.parse(identifyCall[0])
      expect(identifyMsg.d.eventSubscriptions).toBe(EventSubscription.Scenes | EventSubscription.Inputs)
    })
  })

  describe('Request/Response Protocol', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]
      
      // Complete handshake
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: { obsStudioVersion: '30.2.2', obsWebSocketVersion: '5.5.2', rpcVersion: 1 },
        }),
      })
      
      await new Promise(resolve => setTimeout(resolve, 0))
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: { negotiatedRpcVersion: 1 },
        }),
      })
      
      await connectPromise
    })

    test('sends request with correct structure', async () => {
      const requestPromise = obs.call('SetCurrentProgramScene', { sceneName: 'Scene 12' })

      // Get the sent request
      const requestCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.Request
      })

      expect(requestCall).toBeDefined()
      const requestMsg = JSON.parse(requestCall[0])
      
      // Verify request structure matches protocol
      expect(requestMsg).toEqual({
        op: OpCode.Request,
        d: {
          requestType: 'SetCurrentProgramScene',
          requestId: expect.any(String),
          requestData: {
            sceneName: 'Scene 12',
          },
        },
      })
      
      // Verify requestId is a valid UUID
      expect(requestMsg.d.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    test('handles successful response with data', async () => {
      const requestPromise = obs.call('GetVersion')

      const requestMsg = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends successful response
      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestResponse,
          d: {
            requestType: 'GetVersion',
            requestId: requestMsg.d.requestId,
            requestStatus: {
              result: true,
              code: RequestStatus.Success,
            },
            responseData: {
              obsVersion: '30.2.2',
              obsWebSocketVersion: '5.5.2',
              rpcVersion: 1,
              availableRequests: ['GetVersion', 'GetStats'],
              supportedImageFormats: ['bmp', 'png', 'jpg'],
              platform: 'macos',
              platformDescription: 'macOS 14.0',
            },
          },
        }),
      })

      const response = await requestPromise
      expect(response).toEqual({
        obsVersion: '30.2.2',
        obsWebSocketVersion: '5.5.2',
        rpcVersion: 1,
        availableRequests: ['GetVersion', 'GetStats'],
        supportedImageFormats: ['bmp', 'png', 'jpg'],
        platform: 'macos',
        platformDescription: 'macOS 14.0',
      })
    })

    test('handles failed response with error code', async () => {
      const requestPromise = obs.call('SetCurrentProgramScene', { sceneName: 'NonExistent' })

      const requestMsg = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends failed response
      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestResponse,
          d: {
            requestType: 'SetCurrentProgramScene',
            requestId: requestMsg.d.requestId,
            requestStatus: {
              result: false,
              code: RequestStatus.ResourceNotFound,
              comment: 'No scene was found by the name of `NonExistent`.',
            },
          },
        }),
      })

      await expect(requestPromise).rejects.toThrow(OBSRequestError)
      
      try {
        await requestPromise
      } catch (error: any) {
        expect(error.code).toBe(RequestStatus.ResourceNotFound)
        expect(error.comment).toBe('No scene was found by the name of `NonExistent`.')
        expect(error.requestType).toBe('SetCurrentProgramScene')
      }
    })

    test('handles response without data', async () => {
      const requestPromise = obs.call('StopStream')

      const requestMsg = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends successful response without data
      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestResponse,
          d: {
            requestType: 'StopStream',
            requestId: requestMsg.d.requestId,
            requestStatus: {
              result: true,
              code: RequestStatus.Success,
            },
          },
        }),
      })

      const response = await requestPromise
      expect(response).toBeUndefined()
    })
  })

  describe('Batch Requests', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: { obsStudioVersion: '30.2.2', obsWebSocketVersion: '5.5.2', rpcVersion: 1 },
        }),
      })
      
      await new Promise(resolve => setTimeout(resolve, 0))
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: { negotiatedRpcVersion: 1 },
        }),
      })
      
      await connectPromise
    })

    test('sends batch request with correct structure', async () => {
      const batchPromise = obs.callBatch([
        { requestType: 'GetVersion' },
        { requestType: 'GetStats' },
        { requestType: 'GetSceneList' },
      ], {
        haltOnFailure: true,
        executionType: 0,
      })

      const batchCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.RequestBatch
      })

      expect(batchCall).toBeDefined()
      const batchMsg = JSON.parse(batchCall[0])
      
      expect(batchMsg.op).toBe(OpCode.RequestBatch)
      expect(batchMsg.d.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(batchMsg.d.haltOnFailure).toBe(true)
      expect(batchMsg.d.executionType).toBe(0)
      expect(batchMsg.d.requests).toHaveLength(3)
      
      // Each request should have its own requestId
      const requestIds = new Set(batchMsg.d.requests.map((r: any) => r.requestId))
      expect(requestIds.size).toBe(3)
    })

    test('handles batch response with mixed results', async () => {
      const batchPromise = obs.callBatch([
        { requestType: 'GetVersion' },
        { requestType: 'SetCurrentProgramScene', requestData: { sceneName: 'NonExistent' } },
      ])

      const batchMsg = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends batch response
      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestBatchResponse,
          d: {
            requestId: batchMsg.d.requestId,
            results: [
              {
                requestType: 'GetVersion',
                requestStatus: {
                  result: true,
                  code: RequestStatus.Success,
                },
                responseData: {
                  obsVersion: '30.2.2',
                },
              },
              {
                requestType: 'SetCurrentProgramScene',
                requestStatus: {
                  result: false,
                  code: RequestStatus.ResourceNotFound,
                  comment: 'Scene not found',
                },
              },
            ],
          },
        }),
      })

      // Batch should throw if any request fails
      await expect(batchPromise).rejects.toThrow(OBSRequestError)
    })
  })

  describe('Event Messages', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: { obsStudioVersion: '30.2.2', obsWebSocketVersion: '5.5.2', rpcVersion: 1 },
        }),
      })
      
      await new Promise(resolve => setTimeout(resolve, 0))
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: { negotiatedRpcVersion: 1 },
        }),
      })
      
      await connectPromise
    })

    test('emits events with correct data', (done) => {
      obs.on('StudioModeStateChanged', (data) => {
        expect(data).toEqual({
          studioModeEnabled: true,
        })
        done()
      })

      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends event
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Event,
          d: {
            eventType: 'StudioModeStateChanged',
            eventIntent: 1,
            eventData: {
              studioModeEnabled: true,
            },
          },
        }),
      })
    })

    test('emits events without data', (done) => {
      obs.on('ExitStarted', (data) => {
        expect(data).toBeUndefined()
        done()
      })

      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Server sends event without eventData
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Event,
          d: {
            eventType: 'ExitStarted',
            eventIntent: 1,
          },
        }),
      })
    })

    test('handles complex event data', (done) => {
      obs.on('InputCreated', (data) => {
        expect(data).toEqual({
          inputName: 'Browser Source',
          inputUuid: 'f819dcf0-89cc-11eb-8f0e-382c4ac93b9c',
          inputKind: 'browser_source',
          inputSettings: {
            url: 'https://example.com',
            width: 1920,
            height: 1080,
            fps: 30,
          },
        })
        done()
      })

      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.Event,
          d: {
            eventType: 'InputCreated',
            eventIntent: EventSubscription.Inputs,
            eventData: {
              inputName: 'Browser Source',
              inputUuid: 'f819dcf0-89cc-11eb-8f0e-382c4ac93b9c',
              inputKind: 'browser_source',
              inputSettings: {
                url: 'https://example.com',
                width: 1920,
                height: 1080,
                fps: 30,
              },
            },
          },
        }),
      })
    })
  })

  describe('Reidentify', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler for simulating server messages
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: { obsStudioVersion: '30.2.2', obsWebSocketVersion: '5.5.2', rpcVersion: 1 },
        }),
      })
      
      await new Promise(resolve => setTimeout(resolve, 0))
      
      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: { negotiatedRpcVersion: 1 },
        }),
      })
      
      await connectPromise
    })

    test('sends Reidentify message with new event subscriptions', () => {
      obs.reidentify(EventSubscription.None)

      const reidentifyCall = mockWebSocket.send.mock.calls.find((call: any) => {
        const msg = JSON.parse(call[0])
        return msg.op === OpCode.Reidentify
      })

      expect(reidentifyCall).toBeDefined()
      const reidentifyMsg = JSON.parse(reidentifyCall[0])
      
      expect(reidentifyMsg).toEqual({
        op: OpCode.Reidentify,
        d: {
          eventSubscriptions: EventSubscription.None,
        },
      })
    })

    test('throws when not connected', () => {
      obs.disconnect()
      expect(() => obs.reidentify(EventSubscription.None)).toThrow('Not connected to OBS WebSocket')
    })
  })

  describe('Error Handling', () => {
    test('handles invalid JSON messages', () => {
      const errorHandler = mock()
      obs.on('obs:error', errorHandler)

      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Send invalid JSON
      messageHandler({
        data: 'invalid json {',
      })

      expect(errorHandler).toHaveBeenCalled()
    })

    test('handles unknown opcodes', () => {
      const connectPromise = obs.connect('ws://localhost:4455')
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      // Send message with unknown opcode
      messageHandler({
        data: JSON.stringify({
          op: 999,
          d: {},
        }),
      })

      // Should not throw, just log warning
      expect(true).toBe(true)
    })
  })

  describe('Connection State', () => {
    test('tracks connection state correctly', async () => {
      expect(obs.connected).toBe(false)

      const connectPromise = obs.connect('ws://localhost:4455')
      expect(obs.connected).toBe(false)
      
      // Get message handler
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.Hello,
          d: { obsStudioVersion: '30.2.2', obsWebSocketVersion: '5.5.2', rpcVersion: 1 },
        }),
      })

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(obs.connected).toBe(false)

      messageHandler({
        data: JSON.stringify({
          op: OpCode.Identified,
          d: { negotiatedRpcVersion: 1 },
        }),
      })

      await connectPromise
      expect(obs.connected).toBe(true)

      obs.disconnect()
      expect(obs.connected).toBe(false)
    })
  })
})