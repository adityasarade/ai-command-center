/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Clean URL for the fully client-side hosted dashboard demo (static files
  // under public/demo/). A <base href="/demo/"> in that HTML fixes asset paths.
  async rewrites() {
    return [{ source: '/demo', destination: '/demo/index.html' }];
  },
};

export default nextConfig;
