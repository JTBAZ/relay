/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output powers the multi-stage Dockerfile (EH-020).
  // Local `next start` and Vercel builds remain supported.
  output: "standalone"
};

export default nextConfig;
