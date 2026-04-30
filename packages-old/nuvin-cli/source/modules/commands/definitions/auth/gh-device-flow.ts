const DEFAULT_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Iv1.b507a08c87ecfe98';

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval?: number;
  expires_in: number;
  verification_uri_complete?: string;
};

type AccessTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type CopilotTokenResponse = { token: string };

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function form(body: Record<string, string>) {
  return Object.entries(body)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export async function generateVerificationCode() {
  const startRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': 'nuvin-cli',
    },
    body: form({ client_id: DEFAULT_CLIENT_ID, scope: 'read:user' }),
  });

  if (!startRes.ok) throw new Error(`device code request failed: ${startRes.status}`);
  const data: DeviceCodeResponse = (await startRes.json()) as DeviceCodeResponse;

  const verifyUrl = data.verification_uri_complete || data.verification_uri;

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: verifyUrl,
    interval: data.interval,
    expiresIn: data.expires_in,
  };
}

export async function getAccessToken(deviceCode: string, useCopilotToken = false) {
  const deadline = Date.now() + 900 * 1000;
  let interval = Math.max(2, 5);

  while (Date.now() < deadline) {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'nuvin-cli',
      },
      body: form({
        client_id: DEFAULT_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!tokenRes.ok) {
      await sleep(interval * 1000);
      continue;
    }

    const data: AccessTokenResponse = (await tokenRes.json()) as AccessTokenResponse;

    if (data.error) {
      if (data.error === 'authorization_pending' || data.error === 'slow_down') {
        if (data.error === 'slow_down') interval = Math.min(interval + 2, 15);
        await sleep(interval * 1000);
        continue;
      }
      if (data.error === 'access_denied' || data.error === 'expired_token') {
        throw new Error(data.error_description || data.error);
      }
      await sleep(interval * 1000);
      continue;
    }

    if (data.access_token) {
      let token = data.access_token;

      if (useCopilotToken) {
        try {
          const copilotRes = await fetch('https://api.github.com/copilot_internal/v2/token', {
            headers: { Authorization: `Bearer ${data.access_token}`, 'User-Agent': 'nuvin-cli' },
          });
          if (copilotRes.ok) {
            const cop: CopilotTokenResponse = (await copilotRes.json()) as CopilotTokenResponse;
            if (cop?.token) token = cop.token;
          }
        } catch {}
      }

      return token;
    }

    await sleep(interval * 1000);
  }

  throw new Error('authorization timed out');
}

export async function loginGithubDeviceFlow(useCopilotToken = false) {
  const { deviceCode } = await generateVerificationCode();
  const token = await getAccessToken(deviceCode, useCopilotToken);
  return { token };
}
