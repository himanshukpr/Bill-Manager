import path from "node:path"
import { fileURLToPath } from "node:url"

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)

/** @type {import('next').NextConfig} */
const nextConfig = {
	turbopack: {
		root: currentDirPath,
	},
}

export default nextConfig
