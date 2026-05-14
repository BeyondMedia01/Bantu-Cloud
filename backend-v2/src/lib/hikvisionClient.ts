export interface HikvisionRecord {
  deviceUserId: string;
  punchTime: Date;
  punchType: string;
  rawPayload: Record<string, unknown>;
  source: string;
}

export function parseHikvisionPush(xmlBody: string): HikvisionRecord[] {
  const extract = (tag: string) => {
    const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, 's');
    const m = xmlBody.match(re);
    return m ? m[1] : null;
  };

  const major = extract('majorEventType');
  const timeStr = extract('dateTime') || extract('time');
  const employeeNo = extract('employeeNoString') || extract('employeeNo');
  const readerKind = extract('cardReaderKind');
  const sn = extract('ipAddress') || extract('serialNumber') || '';

  if (major !== '5') return [];
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
