import { describe, expect, it } from 'vitest';
import robots from '../app/robots';
import sitemap from '../app/sitemap';
import { PRIVATE_PATHS, PUBLIC_PATHS, siteUrl } from './site';

describe('siteUrl', () => {
  it('prefers SITE_URL, then the Vercel production domain, then localhost', () => {
    expect(siteUrl({ SITE_URL: 'https://example.vn' }).origin).toBe('https://example.vn');
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'seller-business-advisor.vercel.app' }).origin).toBe(
      'https://seller-business-advisor.vercel.app',
    );
    expect(siteUrl({}).origin).toBe('http://localhost:3000');
  });
});

describe('robots and sitemap', () => {
  it('keeps every signed-in page and the API out of search', () => {
    const rules = robots().rules;
    const disallow = Array.isArray(rules) ? rules.flatMap((r) => r.disallow ?? []) : rules.disallow;
    expect(disallow).toEqual(expect.arrayContaining(['/tong-quan', '/bat-dau', '/cai-dat', '/dong-y', '/api/']));
  });

  it('lists only public pages in the sitemap', () => {
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);
    expect(paths).toEqual([...PUBLIC_PATHS]);
    expect(paths.some((p) => PRIVATE_PATHS.some((priv) => p.startsWith(priv)))).toBe(false);
  });
});
