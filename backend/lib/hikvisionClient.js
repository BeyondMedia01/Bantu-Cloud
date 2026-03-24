/**
 * hikvisionClient.js
 *
 * Hikvision ISAPI integration.
 *
 * Hikvision access control devices expose a REST-like API at:
 *   http://{ip}/ISAPI/AccessControl/...
 *
 * Authentication: HTTP Digest (WWW-Authenticate challenge-response).
 *
 * Key endpoints used:
 *   GET  /ISAPI/AccessControl/AcsEvent?format=json&startTime=...&endTime=...&major=5
 *        Returns attendance/access events (swipe records)
 *
 *   GET  /ISAPI/System/deviceInfo
 *        Returns device info (serial number, model)
 *
 * Event types we care about (major=5 for door access):
 *   eventType: 196608 → door access (treat as IN/OUT alternating)
 *   cardReaderKind: 1 = entry reader → IN
 *   cardReaderKind: 2 = exit reader  → OUT
 *
 * Hikvision Push (optional — device can POST events to a configured URL):
 *   Body is XML: <EventNotificationAlert>...</EventNotificationAlert>
 *   Parsed via the biometric webhook endpoint.
 */

'use strict';

const http  = require('http');
const https = require('https');
const crypto = require('crypto');

/**
 * Minimal HTTP Digest auth client.
 * Makes a GET request with Digest authentication to a Hikvision ISAPI endpoint.
 *
 * @param {object} opts  — { ip, port, username, password, path, useHttps }
 * @returns {Promise<object>} Parsed JSON response body
 */
function digestGet(opts) {
  const { ip, port = 80, username, password, path, useHttps = false } = opts;
  const transport = useHttps ? https : http;

  return new Promise((resolve, reject) => {
    const makeRequest = (authHeader) => {
      const headers = { Accept: 'application/json' };
      if (authHeader) headers.Authorization = authHeader;

      const req = transport.request(
        { hostname: ip, port, path, method: 'GET', headers, timeout: 10000,
          rejectUnauthorized: false }, // allow self-signed certs
        (res) => {
          if (res.statusCode === 401 && !authHeader) {
            // Parse WWW-Authenticate and retry with credentials
            const wwwAuth = res.headers['www-authenticate'] || '';
            const digestHeader = buildDigestAuth(wwwAuth, username, password, 'GET', path);
            // Consume response body before retrying
            res.resume();
            makeRequest(digestHeader);
            return;
          }

          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode >= 400) {
              return reject(new Error(`Hikvision ISAPI error ${res.statusCode}: ${body.slice(0, 200)}`));
            }
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body); // some endpoints return plain text/XML
            }
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Hikvision request timed out')); });
      req.end();
    };

    makeRequest(null);
  });
}

function buildDigestAuth(wwwAuth, username, password, method, uri) {
  const realm   = (wwwAuth.match(/realm="([^"]+)"/)  || [])[1] || '';
  const nonce   = (wwwAuth.match(/nonce="([^"]+)"/)  || [])[1] || '';
  const qop     = (wwwAuth.match(/qop="([^"]+)"/)    || [])[1] || '';
  const nc      = '00000001';
  const cnonce  = crypto.randomBytes(8).toString('hex');

  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

  let response;
  if (qop) {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }

  return [
    `Digest username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    ...(qop ? [`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`] : []),
    `response="${response}"`,
  ].join(', ');
}

/**
 * Fetch device info from Hikvision ISAPI.
 * @returns {Promise<{ serialNumber, model }>}
 */
async function getDeviceInfo(device) {
  try {
    const data = await digestGet({
      ip: device.ipAddress, port: device.port || 80,
      username: device.username, password: device.password,
      path: '/ISAPI/System/deviceInfo',
    });
    return {
      serialNumber: data?.DeviceInfo?.serialNumber || '',
      model:        data?.DeviceInfo?.model         || '',
    };
  } catch (err) {
    throw new Error(`getDeviceInfo failed for ${device.ipAddress}: ${err.message}`);
  }
}

/**
 * Fetch attendance events from Hikvision ISAPI for a time window.
 *
 * @param {object} device         — BiometricDevice record
 * @param {Date}   startTime
 * @param {Date}   endTime
 * @returns {Promise<Array<{ deviceUserId, punchTime, punchType, rawPayload }>>}
 */
async function fetchAttendanceEvents(device, startTime, endTime) {
  const fmt = (d) => d.toISOString().replace(/\.\d{3}Z$/, '+00:00');
  const path = `/ISAPI/AccessControl/AcsEvent?format=json&startTime=${fmt(startTime)}&endTime=${fmt(endTime)}&major=5&minor=75&maxResults=1000`;

  let data;
  try {
    data = await digestGet({
      ip: device.ipAddress, port: device.port || 80,
      username: device.username, password: device.password, path,
    });
  } catch (err) {
    throw new Error(`fetchAttendanceEvents failed for ${device.ipAddress}: ${err.message}`);
  }

  const events = data?.AcsEvent?.InfoList || [];
  const records = [];

  for (const evt of events) {
    const pin       = evt.employeeNoString || evt.cardNo || String(evt.employeeNo || '');
    const timeStr   = evt.time || evt.dateTime;
    if (!pin || !timeStr) continue;

    const punchTime = new Date(timeStr);
    if (isNaN(punchTime.getTime())) continue;

    // cardReaderKind: 1 = entry (IN), 2 = exit (OUT), 0 = unknown
    const readerKind = evt.cardReaderKind ?? 0;
    const punchType  = readerKind === 2 ? 'OUT' : 'IN';

    records.push({ deviceUserId: pin.trim(), punchTime, punchType, rawPayload: evt, source: 'HIKVISION' });
  }

  return records;
}

/**
 * Parse a Hikvision event push XML body.
 * Hikvision sends: POST /api/biometric/hikvision with XML body.
 *
 * Returns an array of punch records (may be empty if event type is not attendance).
 *
 * @param {string} xmlBody
 * @returns {Array<{ deviceUserId, punchTime, punchType, rawPayload }>}
 */
function parseHikvisionPush(xmlBody) {
  // Lightweight XML extraction without a full parser
  const extract = (tag) => (xmlBody.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 's')) || [])[1] || null;

  const major       = extract('majorEventType');
  const timeStr     = extract('dateTime') || extract('time');
  const employeeNo  = extract('employeeNoString') || extract('employeeNo');
  const readerKind  = extract('cardReaderKind');
  const sn          = extract('ipAddress') || extract('serialNumber') || '';

  if (major !== '5') return []; // only care about access events
  if (!employeeNo || !timeStr) return [];

  const punchTime = new Date(timeStr);
  if (isNaN(punchTime.getTime())) return [];

  const punchType = readerKind === '2' ? 'OUT' : 'IN';

  return [{
    deviceUserId: employeeNo.trim(),
    punchTime,
    punchType,
    rawPayload: { xml: xmlBody.slice(0, 1000), sn },
    source: 'HIKVISION',
  }];
}

module.exports = { fetchAttendanceEvents, getDeviceInfo, parseHikvisionPush };
