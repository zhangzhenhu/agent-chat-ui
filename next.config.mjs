/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.ELECTRON_STATIC_BUILD === "1" ? "export" : undefined,
  ...(process.env.ELECTRON_STATIC_BUILD === "1" && {
    images: { unoptimized: true },
  }),
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
