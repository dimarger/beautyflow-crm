const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: isGitHubPages ? '/beautyflow-crm' : '',
  assetPrefix: isGitHubPages ? '/beautyflow-crm/' : undefined,
  images: { unoptimized: true },
};

export default nextConfig;
