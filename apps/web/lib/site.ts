export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  if (env.SITE_URL) return new URL(env.SITE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return new URL('http://localhost:3000');
}

export const PUBLIC_PATHS = ['/', '/dang-ky', '/dang-nhap'] as const;

export const PRIVATE_PATHS = ['/tong-quan', '/bat-dau', '/cai-dat', '/dong-y', '/kiem-tra-email', '/tai-len', '/gia-von', '/loi-nhuan', '/hanh-dong', '/doi-thu', '/mau/', '/api/'] as const;

export const noIndex = { robots: { index: false, follow: false } } as const;
