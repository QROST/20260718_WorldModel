export interface RequestOriginInput {
  requestUrl: string;
  origin: string | null;
  host: string | null;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  secFetchSite?: string | null;
}

export interface RequestOriginPolicy {
  publicOrigin?: string | null;
  trustProxyHeaders?: boolean;
}

function singleHeaderValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return !trimmed || trimmed.includes(",") ? null : trimmed;
}

function normalizeHttpOrigin(value: string | null | undefined): string | null {
  const singleValue = singleHeaderValue(value);
  if (!singleValue || singleValue === "null") return null;

  try {
    const url = new URL(singleValue);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function originFromHost(protocol: string, host: string | null): string | null {
  if (!["http:", "https:"].includes(protocol) || !host) return null;
  return normalizeHttpOrigin(`${protocol}//${host}`);
}

/**
 * Compare a browser Origin against origins represented by this HTTP request.
 * Next.js may expose an internal bind/proxy address in request.url, while the
 * Host header still carries the exact origin used by the browser.
 */
export function isAllowedRequestOrigin(
  input: RequestOriginInput,
  policy: RequestOriginPolicy = {},
): boolean {
  if (input.secFetchSite?.trim().toLowerCase() === "cross-site") return false;

  const browserOrigin = normalizeHttpOrigin(input.origin);
  if (!browserOrigin) return false;

  let requestUrl: URL;
  try {
    requestUrl = new URL(input.requestUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(requestUrl.protocol)) return false;

  const candidates = new Set<string>([requestUrl.origin]);
  const directHostOrigin = originFromHost(
    requestUrl.protocol,
    singleHeaderValue(input.host),
  );
  if (directHostOrigin) candidates.add(directHostOrigin);

  const configuredPublicOrigin = normalizeHttpOrigin(policy.publicOrigin);
  if (configuredPublicOrigin) candidates.add(configuredPublicOrigin);

  if (policy.trustProxyHeaders) {
    const forwardedHost = singleHeaderValue(input.forwardedHost);
    const forwardedProto = singleHeaderValue(input.forwardedProto)?.toLowerCase();
    const forwardedOrigin = originFromHost(
      forwardedProto === "http" || forwardedProto === "https"
        ? `${forwardedProto}:`
        : "",
      forwardedHost,
    );
    if (forwardedOrigin) candidates.add(forwardedOrigin);
  }

  return candidates.has(browserOrigin);
}
