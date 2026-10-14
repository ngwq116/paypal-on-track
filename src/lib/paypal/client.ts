export interface PayPalConfig {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
}

export class PayPalError extends Error {
    constructor(public status: number, public body: string) {
        super(`PayPal ${status}: ${body}`)
        this.name = "PayPalError";
    }
}

export type PayPalClient = ReturnType<typeof createPayPalClient>;

export const createPayPalClient = (cfg: PayPalConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now) => { 
    let token: { value: string; expiresAt: number} | null = null;

    async function getToken(): Promise<string> {
        if (token && token.expiresAt - 60_000 > now()) return token.value;

        const res = await fetchImpl(`${cfg.baseUrl}/v1/oauth2/token`,
            { 
                method: "POST",
                headers: {
                    Authorization: "Basic " + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials"
            }
        );

        if (!res.ok) throw new PayPalError(res.status, await res.text());
        const body = (await res.json()) as { access_token: string; expires_in: number};

        token = {value: body.access_token, expiresAt: now() + body.expires_in * 1000};

        return token.value;
    }

      async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}, retried = false): Promise<T> {
    const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // 401 = PayPal rejected the token before processing (revoked or scopes changed).
    // Drop the cache and retry once; payouts stay safe via sender_batch_id idempotency.
    if (res.status === 401 && !retried) {
      token = null;
      return request<T>(method, path, body, headers, true);
    }
    const text = await res.text();
    if (!res.ok) throw new PayPalError(res.status, text);
    return (text ? JSON.parse(text) : {}) as T;
  }

  return { getToken, request };
}

export function payPalFromEnv(): PayPalClient {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE } = process.env;
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_API_BASE) {
    throw new Error("Missing PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET or PAYPAL_API_BASE in .env");
  }
  return createPayPalClient({ clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET, baseUrl: PAYPAL_API_BASE });
}
