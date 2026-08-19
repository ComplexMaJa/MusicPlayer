import net from 'net';
import { Track } from '../../shared/types';

export const DEFAULT_DISCORD_CLIENT_ID = '463097721130188830';
const DEFUNCT_DISCORD_CLIENT_ID = '1223948332155703357';

let currentClientId = DEFAULT_DISCORD_CLIENT_ID;
let ipcSocket: net.Socket | null = null;
let isConnected = false;
let isHandshakeComplete = false;
let reconnectTimer: NodeJS.Timeout | null = null;
let currentPipeIndex = 0;
let lastSentTime = 0;
let pendingUpdateTimer: NodeJS.Timeout | null = null;

let lastState: {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  showTrack: boolean;
  showElapsed: boolean;
  largeImage?: string;
  largeImageText?: string;
  activityType?: 'listening' | 'playing';
} = {
  track: null,
  isPlaying: false,
  currentTime: 0,
  showTrack: true,
  showElapsed: true,
  largeImage: 'logo',
  largeImageText: 'MaJa Player (Lossless Audio)',
  activityType: 'listening',
};

function getPipePath(id: number): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\discord-ipc-${id}`;
  }
  const env = process.env;
  const tempDir = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp';
  return `${tempDir.replace(/\/$/, '')}/discord-ipc-${id}`;
}

export function initDiscordRPC(clientId?: string): void {
  if (clientId && clientId !== DEFUNCT_DISCORD_CLIENT_ID) {
    currentClientId = clientId;
  } else {
    currentClientId = DEFAULT_DISCORD_CLIENT_ID;
  }
  currentPipeIndex = 0;
  connectToDiscord(0);
}

export function setDiscordClientId(clientId: string): void {
  const targetId = (!clientId || clientId === DEFUNCT_DISCORD_CLIENT_ID) ? DEFAULT_DISCORD_CLIENT_ID : clientId;
  if (targetId === currentClientId && isConnected) return;
  currentClientId = targetId;
  disconnect();
  currentPipeIndex = 0;
  connectToDiscord(0);
}

export function disconnect(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }
  if (ipcSocket) {
    ipcSocket.removeAllListeners();
    ipcSocket.destroy();
    ipcSocket = null;
  }
  isConnected = false;
  isHandshakeComplete = false;
}

function connectToDiscord(pipeId: number): void {
  if (isConnected || pipeId > 9) {
    if (!isConnected && pipeId > 9) {
      // Re-scan from pipe 0 after a cooldown
      reconnectTimer = setTimeout(() => {
        currentPipeIndex = 0;
        connectToDiscord(0);
      }, 5000);
    }
    return;
  }

  currentPipeIndex = pipeId;
  const pipePath = getPipePath(pipeId);

  try {
    const socket = net.connect(pipePath, () => {
      ipcSocket = socket;
      isConnected = true;
      sendHandshake();
    });

    socket.on('data', (data: Buffer | string) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      handleSocketData(buf);
    });

    socket.on('error', () => {
      disconnect();
      reconnectTimer = setTimeout(() => connectToDiscord(pipeId + 1), 250);
    });

    socket.on('close', () => {
      disconnect();
      reconnectTimer = setTimeout(() => connectToDiscord(0), 4000);
    });
  } catch (err) {
    disconnect();
    reconnectTimer = setTimeout(() => connectToDiscord(pipeId + 1), 250);
  }
}

function sendPacket(op: number, data: object): void {
  if (!ipcSocket || !isConnected) return;
  try {
    const payload = JSON.stringify(data);
    const len = Buffer.byteLength(payload);
    const buf = Buffer.alloc(8 + len);
    buf.writeInt32LE(op, 0);
    buf.writeInt32LE(len, 4);
    buf.write(payload, 8, len, 'utf8');
    ipcSocket.write(buf);
  } catch (err) {
    console.warn('Discord RPC write error:', err);
  }
}

function sendHandshake(): void {
  sendPacket(0, {
    v: 1,
    client_id: currentClientId,
  });
}

function handleSocketData(data: Buffer): void {
  try {
    if (data.length < 8) return;
    const op = data.readInt32LE(0);
    const len = data.readInt32LE(4);
    if (data.length < 8 + len) return;

    const payloadStr = data.toString('utf8', 8, 8 + len);
    const payload = JSON.parse(payloadStr);

    if (payload.cmd === 'DISPATCH' && payload.evt === 'READY') {
      isHandshakeComplete = true;
      if (lastState.track && lastState.isPlaying) {
        dispatchPresence();
      }
    }
  } catch (err) {
    // Ignore packet parse errors
  }
}

export function formatTrackAudioSpecs(track: Track): string {
  const codec = (track.codec || 'FLAC').toUpperCase();
  const parts: string[] = [codec];

  if (track.bitDepth) {
    parts.push(`${track.bitDepth}bit`);
  }

  if (track.sampleRate) {
    const khz =
      track.sampleRate >= 1000
        ? (track.sampleRate / 1000) % 1 === 0
          ? `${track.sampleRate / 1000}kHz`
          : `${(track.sampleRate / 1000).toFixed(1)}kHz`
        : `${track.sampleRate}Hz`;
    parts.push(khz);
  } else if (track.bitrate) {
    const kbps = track.bitrate > 1000 ? Math.round(track.bitrate / 1000) : track.bitrate;
    parts.push(`${kbps}kbps`);
  }

  return parts.join(' • ');
}

function dispatchPresence(): void {
  if (!isConnected || !isHandshakeComplete || !ipcSocket) return;

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
    sendPacket(1, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: null,
      },
      nonce: `${Date.now()}`,
    });
    return;
  }

  const startTimestamp = Math.floor(Date.now() - Math.max(0, currentTime) * 1000);
  const endTimestamp =
    track.duration && track.duration > 0
      ? Math.floor(startTimestamp + track.duration * 1000)
      : undefined;

  const artistText = track.artist ? track.artist : 'Unknown Artist';
  const albumText = track.album ? ` • ${track.album}` : '';

  const audioSpecs = formatTrackAudioSpecs(track);
  const resolvedHover =
    largeImageText &&
    largeImageText.trim() !== '' &&
    largeImageText !== 'MaJa Player (Lossless Audio)' &&
    largeImageText !== 'MaJa Player'
      ? largeImageText.trim()
      : audioSpecs;

  const activity: any = {
    type: activityType === 'playing' ? 0 : 2,
    details: showTrack ? (track.title || 'Playing Audio') : 'Listening to Music',
    state: showTrack ? `${artistText}${albumText}` : audioSpecs,
    assets: {
      large_text: resolvedHover,
      small_text: isPlaying ? 'Playing' : 'Paused',
    },
  };

  if (largeImage && largeImage.trim() !== '') {
    activity.assets.large_image = largeImage.trim();
  }

  if (showElapsed) {
    if (endTimestamp) {
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

  sendPacket(1, {
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
  const isTimeDiscrepancy = Math.abs(lastState.currentTime - currentTime) > 3;

  lastState = {
    track,
    isPlaying,
    currentTime,
    showTrack,
    showElapsed,
    largeImage: largeImage ?? lastState.largeImage,
    largeImageText: largeImageText ?? lastState.largeImageText,
    activityType: activityType ?? lastState.activityType,
  };

  if (!isConnected || !isHandshakeComplete || !ipcSocket) return;

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
    track: null,
    isPlaying: false,
    currentTime: 0,
    showTrack: true,
    showElapsed: true,
  };

  if (pendingUpdateTimer) {
    clearTimeout(pendingUpdateTimer);
    pendingUpdateTimer = null;
  }

  if (!isConnected || !isHandshakeComplete || !ipcSocket) return;

  sendPacket(1, {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity: null,
    },
    nonce: `${Date.now()}`,
  });
}
