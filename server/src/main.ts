import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config();

declare global {
  // Guard for dev/watch mode to avoid double bootstrap on module re-evaluation.
  var __BILL_MANAGER_NEST_BOOTSTRAPPED__: boolean | undefined;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    credentials: false,
    allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With', 'Origin'],
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT || 3000;
  console.log(`Starting server on http://localhost:${port}`);
  await app.listen(port, '0.0.0.0');
}

if (!globalThis.__BILL_MANAGER_NEST_BOOTSTRAPPED__) {
  globalThis.__BILL_MANAGER_NEST_BOOTSTRAPPED__ = true;
  void bootstrap();
}
