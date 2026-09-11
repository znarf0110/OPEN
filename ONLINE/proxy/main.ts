import type { Socket } from "bun";

const PORT = process.env.PORT || "3000";
const HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

function byteToString(i: number) {
  return i.toString(16).padStart(2, "0").toUpperCase();
}

// like 'C1 04 00 01'
function stringifyPacket(buffer: Buffer | Uint8Array) {
  return Array.from(buffer).map(byteToString).join(" ");
}

type WebSocketData = {
  targetHost: string;
  targetPort: number;
  tcpSocket?: Socket;
};

Bun.serve<WebSocketData>({
  port: PORT,
  hostname: HOSTNAME,

  fetch(req, server) {
    const searchParams = new URL(req.url).searchParams;

    const targetHost = searchParams.get("host");
    const targetPortString = searchParams.get("port");

    if (!targetHost || !targetPortString) {
      return new Response("Missing host or port", {
        status: 400,
      });
    }

    const targetPort = Number.parseInt(targetPortString, 10);

    if (!Number.isFinite(targetPort) || targetPort <= 0) {
      return new Response("Invalid port", {
        status: 400,
      });
    }

    if (
      server.upgrade(req, {
        data: {
          targetHost,
          targetPort,
        },
      })
    ) {
      return;
    }

    return new Response("Upgrade failed :(", {
      status: 500,
    });
  },

  websocket: {
    sendPings: false,

    open(ws) {
      console.log(
        `client connected, target: ${ws.data.targetHost}:${ws.data.targetPort}`
      );

      Bun.connect({
        hostname: ws.data.targetHost,
        port: ws.data.targetPort,

        socket: {
          data(socket, data) {
            console.log("data from tcp:", stringifyPacket(data));

            // Copy Bun's Buffer into a fresh Uint8Array.
            // This avoids the ArrayBufferLike vs ArrayBuffer
            // incompatibility in the current TypeScript/Bun types.
            const packet = new Uint8Array(data.byteLength);
            packet.set(data);

            ws.send(packet);
          },

          open(socket) {
            ws.data.tcpSocket = socket;
          },

          close(socket) {
            if (ws.data.tcpSocket === socket) {
              ws.data.tcpSocket = undefined;
            }
          },

          drain(socket) {
            // Nothing needed here.
          },

          error(socket, error) {
            console.log("tcp error:", error);

            if (ws.data.tcpSocket === socket) {
              ws.data.tcpSocket = undefined;
            }

            ws.close();
          },

          connectError(socket, error) {
            console.log(
              `tcp connect error(${ws.data.targetHost}:${ws.data.targetPort}):`,
              error
            );

            ws.data.tcpSocket = undefined;
            ws.close();
          },

          end(socket) {
            if (ws.data.tcpSocket === socket) {
              ws.data.tcpSocket = undefined;
            }

            ws.close();
          },

          timeout(socket) {
            console.log(
              `tcp timeout(${ws.data.targetHost}:${ws.data.targetPort})`
            );

            if (ws.data.tcpSocket === socket) {
              ws.data.tcpSocket = undefined;
            }

            ws.close();
          },
        },
      });
    },

    message(ws, message) {
      const socket = ws.data.tcpSocket;

      if (!socket) {
        return;
      }

      // Bun WebSocket messages can be strings or binary data.
      if (typeof message === "string") {
        console.log("data from ws:", message);

        socket.write(message);
        socket.flush();
        return;
      }

      console.log("data from ws:", stringifyPacket(message));

      // Copy the incoming Buffer into a fresh Uint8Array.
      const packet = new Uint8Array(message.byteLength);
      packet.set(message);

      socket.write(packet);
      socket.flush();
    },

    close(ws, code, message) {
      const socket = ws.data.tcpSocket;

      if (!socket) {
        return;
      }

      socket.flush();
      socket.end();
      ws.data.tcpSocket = undefined;
    },
  },
});

console.log("Listening...");