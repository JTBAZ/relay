/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const relay = (process.env.NEXT_PUBLIC_RELAY_API_URL ?? "http://127.0.0.1:8787").replace(
      /\/+$/,
      ""
    );
    return [
      {
        source: "/api/relay/library-zip",
        destination: `${relay}/api/v1/export/library-zip`
      }
    ];
  }
};

export default nextConfig;
