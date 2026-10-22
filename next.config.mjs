/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { serverComponentsExternalPackages: ["pdfjs-dist", "pg", "@node-rs/argon2"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        // Framing, plugins, base-URL and form-target restrictions. (A full script-src policy needs per-request nonces
        // for Next.js inline scripts; not done yet.)
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
        // HTTPS only, for two years, on this host and its subdomains (ignored by browsers over plain http://localhost).
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};
export default nextConfig;
