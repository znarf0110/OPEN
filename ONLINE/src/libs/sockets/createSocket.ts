import { EventBus } from "../eventBus";
import {
  ConnectServerPackets,
  ServerToClientPackets,
  SimpleModulusDecryptor,
} from "../../common";
import {
  byteToString,
  getPacketSize,
  getSizeOfPacketType,
} from "../../common/utils";

type Options = {
  wsAddress: string;
  tcpIP: string;
  tcpPort: number;
};

const STCPackets = [
  ...ConnectServerPackets,
  ...ServerToClientPackets,
].filter((p) => p.Direction === "ServerToClient");

type PacketDefinition = (typeof STCPackets)[number];

const packetsCacheByCode: Array<PacketDefinition[]> = [];

STCPackets.forEach((p) => {
  const code = p.Code;

  if (packetsCacheByCode[code] == null) {
    packetsCacheByCode[code] = [p];
  } else {
    packetsCacheByCode[code].push(p);
  }
});

const HEADERS = new Set<number>([0xc1, 0xc2, 0xc3, 0xc4]);

const DEBUG_LOG = false;
const INFO_LOG = true;

export function createSocket({ wsAddress, tcpIP, tcpPort }: Options) {
  const LOG_PREFIX = `[${tcpIP}:${tcpPort}]`;

  const decryptor = new SimpleModulusDecryptor();
  decryptor.decryptionKeys = SimpleModulusDecryptor.DefaultClientKey;

  const socket = new WebSocket(
    `${wsAddress}?host=${tcpIP}&port=${tcpPort}`
  );
  socket.binaryType = "arraybuffer";

  let bytes = new Uint8Array(0);

  function removePacketAndGoNext(length: number) {
    bytes = bytes.slice(length);

    if (bytes.byteLength > 0) {
      handlePacketsQueue();
    }
  }

  function handlePacketsQueue() {
    if (bytes.length < 1) return;

    DEBUG_LOG &&
      console.log(
        `${LOG_PREFIX}handlePacketsQueue: ${bytes.length} bytes in queue...`
      );

    const packetType = bytes[0];

    if (!HEADERS.has(packetType)) {
      console.error(
        `${LOG_PREFIX}NOT_MU_PACKET: 0x${byteToString(packetType)}`
      );

      // WS protocol packets:
      // 0x6B, 0x89
      if (packetType === 0x89 || packetType === 0x6b) {
        console.log(`${LOG_PREFIX}`, bytes);
        return;
      }
    }

    const packetHeaderSize = getSizeOfPacketType(packetType);
    const length = getPacketSize(bytes);

    if (length > bytes.byteLength) {
      return;
    }

    const packetBytes = new Uint8Array(length);
    packetBytes.set(bytes.subarray(0, length));

    let packet = new DataView(packetBytes.buffer);

    DEBUG_LOG &&
      console.log(
        `${LOG_PREFIX}Try to find packet 0x${byteToString(
          packetType
        )}, lng: ${length}`
      );

    if (packetType >= 0xc3) {
      const [s, decryptedPacket] = decryptor.Decrypt(packetBytes);

      if (!s) {
        console.error(`${LOG_PREFIX} can't decrypt packet`);
        removePacketAndGoNext(length);
        return;
      }

      const decryptedBytes = new Uint8Array(decryptedPacket.length);
      decryptedBytes.set(decryptedPacket);

      packet = new DataView(decryptedBytes.buffer);

      DEBUG_LOG &&
        console.log(
          `${LOG_PREFIX}Decrypted packet 0x${byteToString(
            packetType
          )}, lng: ${length}:`,
          decryptedBytes
        );
    }

    const codeIndex = packetHeaderSize === 3 ? 3 : 2;

    if (packet.byteLength <= codeIndex + 1) {
      console.error(`${LOG_PREFIX}packet is too short`);
      removePacketAndGoNext(length);
      return;
    }

    const packetCode = packet.getUint8(codeIndex);
    const subCode = packet.getUint8(codeIndex + 1);

    const packetsByCode = packetsCacheByCode[packetCode];

    if (!packetsByCode) {
      console.error(
        `${LOG_PREFIX}no packet: 0x${byteToString(packetCode)}`
      );
      removePacketAndGoNext(length);
      return;
    }

    const pDef = packetsByCode.find((p) => {
      const definedSubCode =
        "SubCode" in p ? p.SubCode : undefined;

      return definedSubCode == null || definedSubCode === subCode;
    });

    if (!pDef) {
      console.error(
        `${LOG_PREFIX}no packet: 0x${byteToString(packetCode)}`
      );
      removePacketAndGoNext(length);
      return;
    }

    const definedSubCode =
      "SubCode" in pDef ? pDef.SubCode : undefined;

    INFO_LOG &&
      console.log(
        `${LOG_PREFIX}[${pDef.name}][${pDef.HeaderType}]0x${byteToString(
          pDef.Code
        )}${
          definedSubCode != null
            ? `(0x${byteToString(definedSubCode)})`
            : ""
        } lng:${length}`
      );

    EventBus.emit(pDef.Name, packet);

    removePacketAndGoNext(length);
  }

  socket.addEventListener("message", (event) => {
    const buffer = event.data as ArrayBuffer;

    const newBytes = new Uint8Array(buffer);
    DEBUG_LOG &&
      console.log(
        `${LOG_PREFIX}received ${newBytes.length} bytes:`,
        newBytes
      );

    const combined = new Uint8Array(bytes.length + newBytes.length);
    combined.set(bytes);
    combined.set(newBytes, bytes.length);
    bytes = combined;

    handlePacketsQueue();
  });

      socket.addEventListener("open", (event) => {
      console.log(`${LOG_PREFIX}opened:`, event);
      EventBus.emit("wsOpened", { socket });
    });

    socket.addEventListener("close", (event) => {
      console.log(`${LOG_PREFIX}closed:`, event);
      EventBus.emit("wsClosed", { socket });
    });

    socket.addEventListener("error", (event) => {
      console.log(`${LOG_PREFIX}error:`, event);

      EventBus.emit("wsError", {
        socket,
        error: event,
      });
    });

    return { socket } as const;
  }
