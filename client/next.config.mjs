/** @type {import('next').NextConfig} */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:5000'

const nextConfig = {
	async rewrites() {
		return [
			{
				source: '/api/:path*',
				destination: `${apiBaseUrl.replace(/\/$/, '')}/:path*`,
			},
		]
	},
}

export default nextConfig
