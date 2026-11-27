export default {
  agentRules: false,
  poweredByHeader: false,
  serverExternalPackages: ['@react-pdf/renderer'],
  outputFileTracingIncludes: {
    '/*': ['./mockup/data.js', './mockup/assets/logo-rs-annisa.png'],
  },
  async headers() {
    return [
      {
        source: '/((?!api/).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};
