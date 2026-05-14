const STATUS_MAP: Record<string, string> = {
  '0': 'IN',
  '1': 'OUT',
  '2': 'IN',
  '3': 'OUT',
  '4': 'BREAK_OUT',
  '5': 'BREAK_IN',
};

export interface AttendanceRecord {
  deviceUserId: string;
  punchTime: Date;
  punchType: string;
  rawPayload: Record<string, unknown>;
  source: string;
}

export function parseAdmsPayload(body: string, sn: string): { sn: string; records: AttendanceRecord[] } {
  const records: AttendanceRecord[] = [];
  const lines = body.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('SN=') || line.startsWith('table=') || line.startsWith('Stamp=')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const [pin, dateStr, statusCode] = parts;
    if (!pin || !dateStr) continue;
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

export function buildAdmsAck(sn: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `GET OPTION FROM: ${sn}\nATTLOG: ${timestamp}\n`;
}

export function buildAdmsOptions(sn: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
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
