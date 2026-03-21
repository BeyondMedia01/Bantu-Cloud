/**
 * zktecoClient.js
 *
 * ZKTeco integration via two channels:
 *
 * 1. ADMS Push (preferred) — device sends attendance records to our webhook.
 *    Configure on device: Cloud Server = http://yourserver/api/biometric/zkteco
 *    Protocol: ADMS (ZKWL/ADMS 3.0)
 *
 * 2. Direct TCP/IP pull via ZKTeco's binary protocol on port 4370.
 *    Uses the open-source `node-zkteco` approach over raw TCP sockets.
 *    Supports ZK4500, ZK9500, ZEM800, iClock series etc.
 *
 * ADMS Push Format (POST body is plain text):
 *   SN=DEVICE_SERIAL\n
 *   table=ATTLOG\n
 *   PIN\tDate\tStatus\tVerify\tWorkCode\tReserved\n
 *   ...
 *
 * ATTLOG Status codes:
 *   0 = Check In
 *   1 = Check Out
 *   4 = Break Out
 *   5 = Break In
 *   2 = Overtime In
 *   3 = Overtime Out
 */

'use strict';

const net = require('net');

// Status code → punchType mapping
const STATUS_MAP = {
  '0': 'IN',
  '1': 'OUT',
  '2': 'IN',      // Overtime In → treat as IN
  '3': 'OUT',     // Overtime Out → treat as OUT
  '4': 'BREAK_OUT',
  '5': 'BREAK_IN',
};

/**
 * Parse the ADMS ATTLOG text payload from a ZKTeco device push.
 *
 * @param {string} body  — Raw request body text
 * @param {string} sn    — Device serial number from query string
 * @returns {{ sn: string, records: AttendanceLogInput[] }}
 */
function parseAdmsPayload(body, sn) {
  const records = [];

  const lines = body.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    // Skip header lines (SN=..., table=...)
    if (line.startsWith('SN=') || line.startsWith('table=') || line.startsWith('Stamp=')) continue;

    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const [pin, dateStr, statusCode] = parts;
    if (!pin || !dateStr) continue;

    // dateStr format: "YYYY-MM-DD HH:MM:SS"
    const punchTime = new Date(dateStr);
    if (isNaN(punchTime.getTime())) continue;

    records.push({
      deviceUserId: pin.trim(),
      punchTime,
      punchType: STATUS_MAP[statusCode?.trim()] || 'IN',
      rawPayload: { line, sn },
      source: 'DEVICE',
    });
  }

  return { sn, records };
}

/**
 * Build the ADMS acknowledgement response body.
 * ZKTeco devices expect this response to confirm receipt.
 *
 * @param {string} sn — Device serial
 * @returns {string}
 */
function buildAdmsAck(sn) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `GET OPTION FROM: ${sn}\nATTLOG: ${timestamp}\n`;
}

/**
 * Build the ADMS options response for the device handshake (GET /iclock/cdata).
 * The device calls this on boot to retrieve its configuration.
 *
 * @param {string} sn
 * @returns {string}
 */
function buildAdmsOptions(sn) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return [
    `GET OPTION FROM: ${sn}`,
    `Stamp=${Math.floor(Date.now() / 1000)}`,
    `ATTLOG=${Math.floor(Date.now() / 1000)}`,
    `OpLog=9999999999`,
    `ATTPhotograph=9999999999`,
    `ErrorDelay=30`,
    `Delay=10`,
    `TransTimes=00:00;14:05`,
    `TransInterval=1`,
    `TransFlag=TransData AttLog`,
    `Realtime=1`,
    `Encrypt=None`,
    `ServerName=${sn}`,
    `ServerUrl=`,
    `DateTime=${dateStr}`,
  ].join('\n');
}

// ─── Direct TCP Pull (ZKTeco Binary Protocol) ─────────────────────────────────
// Minimal implementation of the ZK binary protocol for attendance log pull.
// This works with most ZKTeco devices on port 4370.

const ZK_HEADER_SIZE = 8;
const CMD_CONNECT = 1000;
const CMD_DISCONNECT = 1001;
const CMD_GET_ATTENDANCE = 13;
const CMD_ACK_OK = 2000;
const CMD_PREPARE_DATA = 1500;
const CMD_DATA = 1501;
const CMD_FREE_DATA = 1502;

function buildPacket(command, data, sessionId = 0, replyId = 0) {
  const dataLen = Buffer.isBuffer(data) ? data.length : (data ? Buffer.byteLength(data) : 0);
  const buf = Buffer.alloc(ZK_HEADER_SIZE + dataLen);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);           // checksum placeholder
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  if (dataLen > 0 && data) {
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    dataBuf.copy(buf, ZK_HEADER_SIZE);
  }
  // Compute checksum
  let cs = 0;
  for (let i = 0; i < buf.length; i++) cs = (cs + buf[i]) & 0xFFFF;
  buf.writeUInt16LE(cs, 2);
  return buf;
}

/**
 * Pull attendance logs directly from a ZKTeco device over TCP.
 *
 * @param {string} ip
 * @param {number} port  — default 4370
 * @param {number} timeout — ms
 * @returns {Promise<Array<{ deviceUserId, punchTime, punchType, rawPayload }>>}
 */
function pullAttendanceTCP(ip, port = 4370, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let sessionId = 0;
    const records = [];
    let buffer = Buffer.alloc(0);
    let state = 'CONNECTING';
    let timer;

    const cleanup = () => { clearTimeout(timer); client.destroy(); };
    timer = setTimeout(() => { cleanup(); reject(new Error('ZKTeco TCP connection timed out')); }, timeout);

    client.connect(port, ip, () => {
      // Send CONNECT command
      client.write(buildPacket(CMD_CONNECT, null, 0, 65535));
    });

    client.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= ZK_HEADER_SIZE) {
        const cmd    = buffer.readUInt16LE(0);
        const sId    = buffer.readUInt16LE(4);
        const rId    = buffer.readUInt16LE(6);
        const dataLen = buffer.length - ZK_HEADER_SIZE;

        if (state === 'CONNECTING' && cmd === CMD_ACK_OK) {
          sessionId = sId;
          state = 'REQUESTING';
          buffer = Buffer.alloc(0);
          // Request attendance data
          client.write(buildPacket(CMD_GET_ATTENDANCE, null, sessionId, rId + 1));
          return;
        }

        if (state === 'REQUESTING') {
          if (cmd === CMD_PREPARE_DATA) {
            // Data size is in first 4 bytes of data section
            state = 'RECEIVING';
            buffer = Buffer.alloc(0);
            client.write(buildPacket(CMD_DATA, null, sessionId, rId + 1));
            return;
          }
          if (cmd === CMD_ACK_OK && dataLen > 8) {
            // Inline data mode — parse directly
            const data = buffer.slice(ZK_HEADER_SIZE);
            parseZkAttendanceBuffer(data, records);
            state = 'DONE';
            buffer = Buffer.alloc(0);
            client.write(buildPacket(CMD_DISCONNECT, null, sessionId, rId + 1));
            return;
          }
        }

        if (state === 'RECEIVING' && cmd === CMD_DATA) {
          const data = buffer.slice(ZK_HEADER_SIZE);
          parseZkAttendanceBuffer(data, records);
          state = 'DONE';
          buffer = Buffer.alloc(0);
          client.write(buildPacket(CMD_FREE_DATA, null, sessionId, rId + 1));
          client.write(buildPacket(CMD_DISCONNECT, null, sessionId, rId + 2));
          return;
        }

        // Advance buffer
        buffer = buffer.slice(ZK_HEADER_SIZE + dataLen);
      }
    });

    client.on('close', () => { cleanup(); resolve(records); });
    client.on('error', (err) => { cleanup(); reject(err); });
  });
}

// ZKTeco attendance record is 40 bytes: PIN(24) + type(1) + verify(1) + datetime(4) + workcode(4) + padding
function parseZkAttendanceBuffer(buf, out) {
  const RECORD_SIZE = 40;
  for (let offset = 0; offset + RECORD_SIZE <= buf.length; offset += RECORD_SIZE) {
    const pinRaw = buf.slice(offset, offset + 24);
    const pin = pinRaw.toString('ascii').replace(/\0/g, '').trim();
    const type = buf.readUInt8(offset + 24);
    // Verify = buf[offset+25]
    const seconds = buf.readUInt32LE(offset + 26); // seconds since ZK epoch (2000-01-01)
    const ZK_EPOCH = new Date('2000-01-01T00:00:00Z').getTime() / 1000;
    const punchTime = new Date((ZK_EPOCH + seconds) * 1000);

    if (!pin) continue;
    out.push({
      deviceUserId: pin,
      punchTime,
      punchType: STATUS_MAP[String(type)] || 'IN',
      rawPayload: { type, seconds },
      source: 'DEVICE',
    });
  }
}

module.exports = { parseAdmsPayload, buildAdmsAck, buildAdmsOptions, pullAttendanceTCP };
