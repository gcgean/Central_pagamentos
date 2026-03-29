/** @type {import('next').NextConfig} */
const apiOrigin = process.env.API_INTERNAL_ORIGIN || 'http://127.0.0.1:3005'

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
