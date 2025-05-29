import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { OBSRequestError, OBSWebSocket } from './obs-websocket'
import { OpCode } from './types/protocol'

describe('OBSWebSocket', () => {
  let obs: OBSWebSocket
  let mockWebSocket: any

  beforeEach(() => {
    obs = new OBSWebSocket()

    // Mock WebSocket
    global.WebSocket = mock((url: string) => {
      mockWebSocket = {
        url,
        readyState: WebSocket.CONNECTING,
        send: mock(),
        close: mock(),
        addEventListener: mock(),
        removeEventListener: mock(),
      }

      // Simulate connection
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

  describe('Connection', () => {
    test('connects without subprotocol', async () => {
      const connectPromise = obs.connect('ws://localhost:4455')

      // Simulate Hello message
      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: {
                obsWebSocketVersion: '5.0.0',
                rpcVersion: 1,
              },
            }),
          })

          // Simulate Identified message
          setTimeout(() => {
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: {
                  negotiatedRpcVersion: 1,
                },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise
      expect(obs.connected).toBe(true)
      expect(mockWebSocket.url).toBe('ws://localhost:4455')
    })

    test('handles authentication', async () => {
      const connectPromise = obs.connect('ws://localhost:4455', 'password123')

      // Simulate Hello message with auth challenge
      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: {
                obsWebSocketVersion: '5.0.0',
                rpcVersion: 1,
                authentication: {
                  challenge: 'challenge123',
                  salt: 'salt123',
                },
              },
            }),
          })

          // Check if Identify message was sent with auth
          setTimeout(() => {
            const identifyCall = mockWebSocket.send.mock.calls.find((call: any) => {
              const msg = JSON.parse(call[0])
              return msg.op === OpCode.Identify
            })

            expect(identifyCall).toBeDefined()
            const identifyMsg = JSON.parse(identifyCall[0])
            expect(identifyMsg.d.authentication).toBeDefined()

            // Simulate Identified response
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: {
                  negotiatedRpcVersion: 1,
                },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise
      expect(obs.connected).toBe(true)
    })

    test('throws error when already connected', async () => {
      const connectPromise = obs.connect('ws://localhost:4455')

      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1 },
            }),
          })

          setTimeout(() => {
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: { negotiatedRpcVersion: 1 },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise

      await expect(obs.connect()).rejects.toThrow('Already connected or connecting')
    })
  })

  describe('Requests', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')

      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1 },
            }),
          })

          setTimeout(() => {
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: { negotiatedRpcVersion: 1 },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise
    })

    test('sends request and receives response', async () => {
      const responsePromise = obs.call('GetVersion')

      // Get the sent message
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      expect(sentMessage.op).toBe(OpCode.Request)
      expect(sentMessage.d.requestType).toBe('GetVersion')
      expect(sentMessage.d.requestId).toBeDefined()

      // Simulate response
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestResponse,
          d: {
            requestType: 'GetVersion',
            requestId: sentMessage.d.requestId,
            requestStatus: {
              result: true,
              code: 100,
            },
            responseData: {
              obsVersion: '28.0.0',
              obsWebSocketVersion: '5.0.0',
            },
          },
        }),
      })

      const response = await responsePromise
      expect(response).toEqual({
        obsVersion: '28.0.0',
        obsWebSocketVersion: '5.0.0',
      })
    })

    test('handles request error', async () => {
      const responsePromise = obs.call('InvalidRequest')

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestResponse,
          d: {
            requestType: 'InvalidRequest',
            requestId: sentMessage.d.requestId,
            requestStatus: {
              result: false,
              code: 204,
              comment: 'Unknown request type',
            },
          },
        }),
      })

      await expect(responsePromise).rejects.toThrow(OBSRequestError)
      await expect(responsePromise).rejects.toThrow('Unknown request type')
    })

    test('throws when not connected', async () => {
      obs.disconnect()
      await expect(obs.call('GetVersion')).rejects.toThrow('Not connected to OBS WebSocket')
    })
  })

  describe('Events', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')

      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1 },
            }),
          })

          setTimeout(() => {
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: { negotiatedRpcVersion: 1 },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise
    })

    test('emits OBS events', (done) => {
      obs.on('CurrentProgramSceneChanged', (data) => {
        expect(data).toEqual({
          sceneName: 'Scene 2',
          sceneUuid: 'uuid-123',
        })
        done()
      })

      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.Event,
          d: {
            eventType: 'CurrentProgramSceneChanged',
            eventIntent: 1,
            eventData: {
              sceneName: 'Scene 2',
              sceneUuid: 'uuid-123',
            },
          },
        }),
      })
    })
  })

  describe('Batch Requests', () => {
    beforeEach(async () => {
      const connectPromise = obs.connect('ws://localhost:4455')

      setTimeout(() => {
        const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
          ([event]: any) => event === 'message'
        )?.[1]

        if (messageHandler) {
          messageHandler({
            data: JSON.stringify({
              op: OpCode.Hello,
              d: { obsWebSocketVersion: '5.0.0', rpcVersion: 1 },
            }),
          })

          setTimeout(() => {
            messageHandler({
              data: JSON.stringify({
                op: OpCode.Identified,
                d: { negotiatedRpcVersion: 1 },
              }),
            })
          }, 0)
        }
      }, 10)

      await connectPromise
    })

    test('sends batch request and receives responses', async () => {
      const batchPromise = obs.callBatch([
        { requestType: 'GetVersion' },
        { requestType: 'GetStats' },
      ])

      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[1][0])
      expect(sentMessage.op).toBe(OpCode.RequestBatch)
      expect(sentMessage.d.requests).toHaveLength(2)

      const messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        ([event]: any) => event === 'message'
      )?.[1]

      messageHandler({
        data: JSON.stringify({
          op: OpCode.RequestBatchResponse,
          d: {
            requestId: sentMessage.d.requestId,
            results: [
              {
                requestType: 'GetVersion',
                requestStatus: { result: true, code: 100 },
                responseData: { obsVersion: '28.0.0' },
              },
              {
                requestType: 'GetStats',
                requestStatus: { result: true, code: 100 },
                responseData: { cpuUsage: 15.5 },
              },
            ],
          },
        }),
      })

      const responses = await batchPromise
      expect(responses).toHaveLength(2)
      expect(responses[0]).toEqual({ obsVersion: '28.0.0' })
      expect(responses[1]).toEqual({ cpuUsage: 15.5 })
    })
  })
})
