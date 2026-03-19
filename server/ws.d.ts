declare module "ws" {
  export class WebSocket {
    static OPEN: number;
    readyState: number;
    send(data: string): void;
    close(): void;
    on(event: "message", listener: (data: { toString(): string }) => void): this;
    on(event: "close", listener: () => void): this;
  }

  export class WebSocketServer {
    clients: Set<WebSocket>;
    constructor(options: { port: number });
    on(event: "connection", listener: (ws: WebSocket) => void): this;
  }
}
