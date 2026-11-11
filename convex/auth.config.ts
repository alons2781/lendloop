// Tells Convex to trust JWTs issued by Clerk.
// CLERK_JWT_ISSUER_DOMAIN is set with: bunx convex env set CLERK_JWT_ISSUER_DOMAIN <url>
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
