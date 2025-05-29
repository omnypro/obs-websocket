type EventListener<T = any> = (data: T) => void | Promise<void>

export class EventEmitter {
  private listeners = new Map<string, Set<EventListener>>()

  on<T = any>(event: string, listener: EventListener<T>): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
    return this
  }

  once<T = any>(event: string, listener: EventListener<T>): this {
    const onceWrapper: EventListener<T> = (data) => {
      this.off(event, onceWrapper)
      listener(data)
    }
    return this.on(event, onceWrapper)
  }

  off<T = any>(event: string, listener: EventListener<T>): this {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listeners.delete(event)
      }
    }
    return this
  }

  emit<T = any>(event: string, data?: T): this {
    const listeners = this.listeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data)
        } catch (error) {
          console.error(`Error in event listener for "${event}":`, error)
        }
      }
    }
    return this
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event)
    } else {
      this.listeners.clear()
    }
    return this
  }
}
