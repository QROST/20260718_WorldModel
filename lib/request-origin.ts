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
      url.hash ||
      url.port === "0"
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  const hostname = new URL(origin).hostname.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function rawAuthorityFromHttpUrl(value: string): string | null {
  return /^https?:\/\/([^/?#]+)/i.exec(value)?.[1] ?? null;
}

function isExactLoopbackAuthority(authority: string | null): boolean {
  if (!authority) return false;
  const match =
    /^(?:localhost|127\.0\.0\.1)(?::([1-9]\d{0,4}))?$/i.exec(authority) ??
    /^\[::1\](?::([1-9]\d{0,4}))?$/i.exec(authority);
  if (!match) return false;
  return !match[1] || Number(match[1]) <= 65_535;
}

function normalizeExactLoopbackOrigin(
  value: string | null | undefined,
): string | null {
  const singleValue = singleHeaderValue(value);
  const normalized = normalizeHttpOrigin(singleValue);
  return normalized &&
    isExactLoopbackAuthority(
      singleValue ? rawAuthorityFromHttpUrl(singleValue) : null,
    )
    ? normalized
    : null;
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
  if (
    isLoopbackOrigin(browserOrigin) &&
    normalizeExactLoopbackOrigin(input.origin) !== browserOrigin
  ) {
    return false;
  }

  let requestUrl: URL;
  try {
    requestUrl = new URL(input.requestUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(requestUrl.protocol)) return false;

  const candidates = new Set<string>();
  const requestUrlOrigin = normalizeHttpOrigin(requestUrl.origin);
  if (
    requestUrlOrigin &&
    isExactLoopbackAuthority(rawAuthorityFromHttpUrl(input.requestUrl))
  ) {
    candidates.add(requestUrlOrigin);
  }
  const directHost = singleHeaderValue(input.host);
  const directHostOrigin = originFromHost(
    requestUrl.protocol,
    directHost,
  );
  if (directHostOrigin && isExactLoopbackAuthority(directHost)) {
    candidates.add(directHostOrigin);
  }

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
