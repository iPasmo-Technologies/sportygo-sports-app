import { Container, getContainer } from '@cloudflare/containers';
import type { DurableObject } from 'cloudflare:workers';

type BackendEnv = {
  SPORTYGO_CONTAINER: DurableObjectNamespace<SportyGoContainer>;
  NODE_ENV: string;
  PORT: string;
  FRONTEND_URL?: string;
  FRONTEND_URLS?: string;
  DATABASE_URL: string;
  DATABASE_SSL: string;
  DATABASE_CONNECTION_TIMEOUT_MS: string;
  DATABASE_POOL_MAX: string;
  JWT_SECRET: string;
  VITE_AUTH_PAYLOAD_KEY: string;
  PASSWORD_AT_REST_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_CURRENCY: string;
  SMTP_HOST: string;
  SMTP_PORT: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  SMTP_FROM: string;
};

export class SportyGoContainer extends Container<BackendEnv> {
  defaultPort = 3001;
  sleepAfter = '10m';
  enableInternet = true;

  constructor(ctx: DurableObject['ctx'], env: BackendEnv) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      FRONTEND_URL: env.FRONTEND_URL ?? '',
      FRONTEND_URLS: env.FRONTEND_URLS ?? '',
      DATABASE_URL: env.DATABASE_URL,
      DATABASE_SSL: env.DATABASE_SSL,
      DATABASE_CONNECTION_TIMEOUT_MS: env.DATABASE_CONNECTION_TIMEOUT_MS,
      DATABASE_POOL_MAX: env.DATABASE_POOL_MAX,
      JWT_SECRET: env.JWT_SECRET,
      VITE_AUTH_PAYLOAD_KEY: env.VITE_AUTH_PAYLOAD_KEY,
      PASSWORD_AT_REST_KEY: env.PASSWORD_AT_REST_KEY,
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      STRIPE_CURRENCY: env.STRIPE_CURRENCY,
      SMTP_HOST: env.SMTP_HOST,
      SMTP_PORT: env.SMTP_PORT,
      SMTP_USER: env.SMTP_USER,
      SMTP_PASS: env.SMTP_PASS,
      SMTP_FROM: env.SMTP_FROM,
    };
  }
}

export default {
  async fetch(request: Request, env: BackendEnv): Promise<Response> {
    const container = getContainer(env.SPORTYGO_CONTAINER, 'api');
    return container.fetch(request);
  },
} satisfies ExportedHandler<BackendEnv>;
