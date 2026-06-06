/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["simple-git", "@prisma/client"],
  },
};

export default nextConfig;
