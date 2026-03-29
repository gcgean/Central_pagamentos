/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3005/api/v1/:path*',
      },
    ]
  },
}
module.exports = nextConfig
