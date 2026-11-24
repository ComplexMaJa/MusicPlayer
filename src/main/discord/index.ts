import net from 'net';
import { Track } from '../../shared/types';

export const DEFAULT_DISCORD_CLIENT_ID = '463097721130188830';
const DEFUNCT_DISCORD_CLIENT_ID = '1223948332155703357';

const MAX_RPC_PACKET_SIZE = 8 * 1024 * 1024;
const MAX_RECEIVE_BUFFER_SIZE = MAX_RPC_PACKET_SIZE + 8;
const DISCONNECT_FLUSH_GRACE_MS = 150;
const RPC_OP_HANDSHAKE = 0;
const RPC_OP_FRAME = 1;
const RPC_OP_CLOSE = 2;
const RPC_OP_PING = 3;
const RPC_OP_PONG = 4;

interface LastPresenceState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  showTrack: boolean;
  showElapsed: boolean;
  largeImage: string;
  largeImageText: string;
  activityType: 'listening' | 'playing';
}

const DEFAULT_LAST_STATE: LastPresenceState = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  showTrack: true,
  showElapsed: true,
  largeImage: 'logo',
  largeImageText: 'MaJa Player',
  activityType: 'listening',
};

let currentClientId = DEFAULT_DISCORD_CLIENT_ID;
let ipcSocket: net.Socket | null = null;
let isEnabled = false;
let isConnected = false;
let isHandshakeComplete = false;
let connectionGeneration = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let lastSentTime = 0;
let pendingUpdateTimer: NodeJS.Timeout | null = null;
let receiveBuffer: Buffer = Buffer.alloc(0);

let lastState: LastPresenceState = { ...DEFAULT_LAST_STATE };

function getPipePath(id: number): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${id}`;
  }
  const env = process.env;
  const tempDir = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp';
  return `${tempDir.replace(/\/$/, '')}/discord-ipc-${id}`;
}

function clampRpcText(value: string, fallback: string, maxChars = 128, minChars = 2): string {
  const trimmed = value.trim();
  const base = trimmed.length > 0 ? trimmed : fallback;
  const padded = base.length < minChars ? base.padEnd(minChars, ' ') : base;
  const chars = Array.from(padded);
  if (chars.length <= maxChars) return padded;
  return chars.slice(0, maxChars).join('');
}

function clearTimers(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }
}

function cleanupSocket(socket: net.Socket, allowGracefulFlush = false): void {
  socket.removeAllListeners();
  // Prevent unhandled EventEmitter 'error' crashes if closing an active pipe fails asynchronously.
  socket.on('error', () => {
    if (!socket.destroyed) {
      socket.destroy();
    }
  });

  if (ipcSocket === socket) {
    ipcSocket = null;
    isConnected = false;
    isHandshakeComplete = false;
    receiveBuffer = Buffer.alloc(0);
  }

  if (allowGracefulFlush && socket.writable && !socket.destroyed) {
    try {
      socket.end(() => {
        if (!socket.destroyed) {
          socket.destroy();
        }
      });
      const forceDestroyTimer = setTimeout(() => {
        if (!socket.destroyed) {
          socket.destroy();
        }
      }, DISCONNECT_FLUSH_GRACE_MS);
      forceDestroyTimer.unref();
      return;
    } catch {
      // Fall back to immediate destroy.
    }
  }

  if (!socket.destroyed) {
    socket.destroy();
  }
}

function scheduleReconnect(pipeId: number, delayMs: number, generation: number): void {
  if (!isEnabled || generation !== connectionGeneration) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToDiscord(pipeId, generation);
  }, delayMs);
}

export function initDiscordRPC(clientId?: string): void {
  disconnect();
  if (clientId && clientId !== DEFUNCT_DISCORD_CLIENT_ID) {
    currentClientId = clientId;
  } else {
    currentClientId = DEFAULT_DISCORD_CLIENT_ID;
  }
  isEnabled = true;
  connectToDiscord(0, connectionGeneration);
}

export function setDiscordClientId(clientId: string): void {
  const targetId =
    !clientId || clientId === DEFUNCT_DISCORD_CLIENT_ID ? DEFAULT_DISCORD_CLIENT_ID : clientId;
  if (targetId === currentClientId && isConnected && isEnabled) return;
  currentClientId = targetId;
  disconnect();
  isEnabled = true;
  connectToDiscord(0, connectionGeneration);
}

export function disconnect(): void {
  isEnabled = false;
  connectionGeneration++;
  clearTimers();

  const socket = ipcSocket;
  const shouldFlushPendingWrite = isConnected && isHandshakeComplete;
  ipcSocket = null;
  isConnected = false;
  isHandshakeComplete = false;
  receiveBuffer = Buffer.alloc(0);

  if (socket) {
    cleanupSocket(socket, shouldFlushPendingWrite);
  }
}

function connectToDiscord(pipeId: number, generation = connectionGeneration): void {
  if (!isEnabled || generation !== connectionGeneration) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (isConnected) {
    return;
  }

  if (pipeId > 9) {
    // Re-scan from pipe 0 after a cooldown
    scheduleReconnect(0, 5000, generation);
    return;
  }

  if (ipcSocket) {
    cleanupSocket(ipcSocket);
  }

  const pipePath = getPipePath(pipeId);

  try {
    let connectionFailed = false;
    const socket = net.connect(pipePath, () => {
      if (!isEnabled || generation !== connectionGeneration || ipcSocket !== socket) {
        cleanupSocket(socket);
        return;
      }
      isConnected = true;
      receiveBuffer = Buffer.alloc(0);
      sendHandshake();
    });
    ipcSocket = socket;

    socket.on('data', (data: Buffer | string) => {
      if (!isEnabled || generation !== connectionGeneration || ipcSocket !== socket) {
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (receiveBuffer.length + buf.length > MAX_RECEIVE_BUFFER_SIZE) {
        console.warn('Discord RPC receive buffer limit exceeded; resetting connection.');
        connectionFailed = true;
        cleanupSocket(socket);
        scheduleReconnect(0, 4000, generation);
        return;
      }
      receiveBuffer = receiveBuffer.length === 0 ? buf : Buffer.concat([receiveBuffer, buf]);
      processIncomingPackets(socket, generation);
    });

    socket.on('error', () => {
      connectionFailed = true;
      cleanupSocket(socket);
      if (isEnabled && generation === connectionGeneration) {
        scheduleReconnect(pipeId + 1, 250, generation);
      }
    });

    socket.on('close', () => {
      if (connectionFailed) return;
      cleanupSocket(socket);
      if (isEnabled && generation === connectionGeneration) {
        scheduleReconnect(0, 4000, generation);
      }
    });
  } catch {
    if (ipcSocket) {
      cleanupSocket(ipcSocket);
    }
    if (isEnabled && generation === connectionGeneration) {
      scheduleReconnect(pipeId + 1, 250, generation);
    }
  }
}

function sendPacket(op: number, data: unknown): void {
  if (!ipcSocket || !isConnected || ipcSocket.destroyed || !ipcSocket.writable) return;
  try {
    const payload = JSON.stringify(data);
    const len = Buffer.byteLength(payload);
    if (len + 8 > MAX_RPC_PACKET_SIZE) {
      console.warn(`Discord RPC outbound packet too large (${len} bytes); dropping`);
      return;
    }
    const buf = Buffer.allocUnsafe(8 + len);
    buf.writeUInt32LE(op >>> 0, 0);
    buf.writeUInt32LE(len >>> 0, 4);
    buf.write(payload, 8, len, 'utf8');
    ipcSocket.write(buf);
  } catch (err) {
    console.warn('Discord RPC write error:', err);
  }
}

function sendHandshake(): void {
  sendPacket(RPC_OP_HANDSHAKE, {
    v: 1,
    client_id: currentClientId,
  });
}

function processIncomingPackets(socket: net.Socket, generation: number): void {
  while (receiveBuffer.length >= 8) {
    const op = receiveBuffer.readUInt32LE(0);
    const len = receiveBuffer.readUInt32LE(4);

    if (len > MAX_RPC_PACKET_SIZE) {
      console.warn(`Discord RPC sent an invalid packet length: ${len}`);
      cleanupSocket(socket);
      scheduleReconnect(0, 4000, generation);
      return;
    }

    if (receiveBuffer.length < 8 + len) {
      return;
    }

    const payload = receiveBuffer.subarray(8, 8 + len);
    const remaining = receiveBuffer.length - (8 + len);
    receiveBuffer =
      remaining === 0 ? Buffer.alloc(0) : Buffer.from(receiveBuffer.subarray(8 + len));

    if (op === RPC_OP_CLOSE) {
      cleanupSocket(socket);
      scheduleReconnect(0, 4000, generation);
      return;
    }

    handleIncomingPacket(op, payload);
  }
}

function handleIncomingPacket(op: number, payloadBuffer: Buffer): void {
  // Discord sends PING frames that must be answered with a PONG carrying the
  // same payload, even before the READY handshake completes.
  if (op === RPC_OP_PING) {
    let payload: unknown = {};
    if (payloadBuffer.length > 0) {
      try {
        payload = JSON.parse(payloadBuffer.toString('utf8'));
      } catch {
        // Keep an empty object for malformed PING payloads.
      }
    }
    sendPacket(RPC_OP_PONG, payload);
    return;
  }

  if (op !== RPC_OP_FRAME) {
    return;
  }

  try {
    const payload: unknown = JSON.parse(payloadBuffer.toString('utf8'));
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (record.cmd === 'DISPATCH' && record.evt === 'READY') {
        isHandshakeComplete = true;
        if (lastState.track && lastState.isPlaying) {
          dispatchPresence();
        }
      }
    }
  } catch {
    // Ignore malformed application frames.
  }
}

export function formatTrackAudioSpecs(track: Track): string {
  const codec = (track.codec || 'AUDIO').toUpperCase();
  const parts: string[] = [codec];

  if (track.bitDepth && Number.isFinite(track.bitDepth)) {
    parts.push(`${track.bitDepth}bit`);
  }

  if (track.sampleRate && Number.isFinite(track.sampleRate)) {
    const khz =
      track.sampleRate >= 1000
        ? (track.sampleRate / 1000) % 1 === 0
          ? `${track.sampleRate / 1000}kHz`
          : `${(track.sampleRate / 1000).toFixed(1)}kHz`
        : `${track.sampleRate}Hz`;
    parts.push(khz);
  } else if (track.bitrate && Number.isFinite(track.bitrate) && track.bitrate > 0) {
    parts.push(`${Math.round(track.bitrate)}kbps`);
  }

  return parts.join(' • ');
}

function dispatchPresence(): void {
  if (!isEnabled || !isConnected || !isHandshakeComplete || !ipcSocket) return;

  const {
    track,
    isPlaying,
    currentTime,
    showTrack,
    showElapsed,
    largeImage,
    largeImageText,
    activityType,
  } = lastState;

  if (!track || !isPlaying) {
    sendPacket(RPC_OP_FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: null,
      },
      nonce: `${Date.now()}`,
    });
    return;
  }

  const safeCurrentTime =
    Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const startTimestamp = Math.floor(Date.now() - safeCurrentTime * 1000);
  const safeDuration =
    track.duration && Number.isFinite(track.duration) && track.duration > 0 ? track.duration : 0;
  const endTimestamp =
    safeDuration > 0 ? Math.floor(startTimestamp + safeDuration * 1000) : undefined;

  const artistText = track.artist ? track.artist : 'Unknown Artist';
  const albumText = track.album ? ` • ${track.album}` : '';

  const audioSpecs = formatTrackAudioSpecs(track);
  const resolvedHover =
    largeImageText &&
    largeImageText.trim() !== '' &&
    largeImageText !== 'MaJa Player'
      ? largeImageText.trim()
      : audioSpecs;

  const activity: {
    type: number;
    details: string;
    state: string;
    assets: {
      large_text: string;
      small_text: string;
      large_image?: string;
    };
    timestamps?: {
      start: number;
      end?: number;
    };
  } = {
    type: activityType === 'playing' ? 0 : 2,
    details: clampRpcText(
      showTrack ? track.title || 'Playing Audio' : 'Listening to Music',
      'Playing Audio'
    ),
    state: clampRpcText(
      showTrack ? `${artistText}${albumText}` : audioSpecs,
      'Unknown Artist'
    ),
    assets: {
      large_text: clampRpcText(resolvedHover, 'MaJa Player'),
      small_text: isPlaying ? 'Playing' : 'Paused',
    },
  };

  if (largeImage && largeImage.trim() !== '') {
    activity.assets.large_image = clampRpcText(largeImage, 'logo', 256, 1);
  }

  if (showElapsed && Number.isFinite(startTimestamp)) {
    if (endTimestamp !== undefined && Number.isFinite(endTimestamp)) {
      activity.timestamps = {
        start: startTimestamp,
        end: endTimestamp,
      };
    } else {
      activity.timestamps = {
        start: startTimestamp,
      };
    }
  }

  sendPacket(RPC_OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity,
    },
    nonce: `${Date.now()}`,
  });

  lastSentTime = Date.now();
}

export function updatePresence(
  track: Track | null,
  isPlaying: boolean,
  currentTime: number,
  showTrack: boolean = true,
  showElapsed: boolean = true,
  largeImage?: string,
  largeImageText?: string,
  activityType?: 'listening' | 'playing'
): void {
  const isTrackChanged = lastState.track?.id !== track?.id;
  const isPlayStateChanged = lastState.isPlaying !== isPlaying;
  const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
  const isTimeDiscrepancy = Math.abs(lastState.currentTime - safeCurrentTime) > 3;

  lastState = {
    track,
    isPlaying,
    currentTime: safeCurrentTime,
    showTrack,
    showElapsed,
    largeImage: largeImage ?? lastState.largeImage,
    largeImageText: largeImageText ?? lastState.largeImageText,
    activityType: activityType ?? lastState.activityType,
  };

  if (!isEnabled || !isConnected || !isHandshakeComplete || !ipcSocket) return;

  // If major state change (track change, play/pause, seek > 3s), send immediately
  const now = Date.now();
  if (isTrackChanged || isPlayStateChanged || isTimeDiscrepancy || now - lastSentTime > 15000) {
    if (pendingUpdateTimer) {
      clearTimeout(pendingUpdateTimer);
      pendingUpdateTimer = null;
    }
    dispatchPresence();
  } else {
    // Debounce non-urgent updates to respect Discord rate limits
    if (!pendingUpdateTimer) {
      pendingUpdateTimer = setTimeout(() => {
        pendingUpdateTimer = null;
        dispatchPresence();
      }, 5000);
    }
  }
}

export function clearPresence(): void {
  lastState = {
    ...DEFAULT_LAST_STATE,
    largeImage: lastState.largeImage,
    largeImageText: lastState.largeImageText,
    activityType: lastState.activityType,
  };

  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }

  if (!isEnabled || !isConnected || !isHandshakeComplete || !ipcSocket) return;

  sendPacket(RPC_OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: null,
    },
    nonce: `${Date.now()}`,
  });
}
