import { bucket, defineRailway, github, postgres, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const callcaster = github("chester-hill-solutions/callcaster", { branch: "dev", checkSuites: false });

  const PostgreSQL18 = postgres("PostgreSQL 18", { region: "us-east4-eqdc4a" });
  const postgresql18Volume = volume("postgresql-18-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "us-east4-eqdc4a", sizeMB: 50000 });
  const callcasterBucket = bucket("callcaster", { region: "iad" });
  const CallCaster = service("CallCaster", {
    source: callcaster,
    healthcheck: "/readyz",
    healthcheckTimeout: 30,
    domains: ["dev.callcaster.ca"],
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "callcaster-review" },
    env: {
      BASE_URL: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      COHERE_API_KEY: preserve(),
      DATABASE_URL: preserve(),
      DISABLE_2FA_ENFORCEMENT: preserve(),
      ELEVENLABS_API_KEY: preserve(),
      HOST: preserve(),
      NODE_ENV: preserve(),
      PORT: preserve(),
      RESEND_API_KEY: preserve(),
      RUN_CLIENT_MIGRATIONS_ON_BOOT: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      SIGNUP_OPEN: preserve(),
      STRIPE_API_KEY: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      TWILIO_API_KEY: preserve(),
      TWILIO_API_SECRET: preserve(),
      TWILIO_APP_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_PHONE_NUMBER: preserve(),
      TWILIO_SID: preserve(),
    },
  });
  const callcasterWorker = service("callcaster-worker", {
    source: callcaster,
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile.worker" },
    replicas: { "us-east4-eqdc4a": 1 },
    env: {
      BASE_URL: preserve(),
      BETTER_AUTH_SECRET: preserve(),
      DATABASE_URL: preserve(),
      NODE_ENV: preserve(),
      RAILWAY_DOCKERFILE_PATH: preserve(),
      RESEND_API_KEY: preserve(),
      S3_ACCESS_KEY_ID: preserve(),
      S3_BUCKET: preserve(),
      S3_ENDPOINT: preserve(),
      S3_REGION: preserve(),
      S3_SECRET_ACCESS_KEY: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      TWILIO_APP_SID: preserve(),
      TWILIO_AUTH_TOKEN: preserve(),
      TWILIO_PHONE_NUMBER: preserve(),
      TWILIO_SID: preserve(),
    },
  });

  return project("CallCaster", {
    resources: [PostgreSQL18, CallCaster, callcasterWorker, postgresql18Volume, callcasterBucket],
  });
});
