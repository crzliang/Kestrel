import UAParser from 'ua-parser-js';

export type DeviceInfo = {
  os: string;
  browser: string;
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
};

export function parseUserAgent(ua: string): DeviceInfo {
  const parser = new UAParser(ua);
  const result = parser.getResult();
  const deviceType = result.device.type;
  let type: DeviceInfo['type'] = 'desktop';
  if (deviceType === 'mobile') type = 'mobile';
  else if (deviceType === 'tablet') type = 'tablet';
  else if (!result.os.name && !result.browser.name) type = 'unknown';

  return {
    os: result.os.name ?? 'Unknown',
    browser: result.browser.name ?? 'Unknown',
    type,
  };
}
