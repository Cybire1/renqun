import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';

// The shared client lives one level up (../client, linked as an npm workspace), so Turbopack's
// root is the repo, and the package's TypeScript is compiled here.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  transpilePackages: ['@renqun/client'],
};

export default nextConfig;
