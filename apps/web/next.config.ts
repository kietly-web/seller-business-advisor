import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@sa/db', '@sa/engine', '@sa/llm', '@sa/parsers', '@sa/shared'],
};

export default nextConfig;
