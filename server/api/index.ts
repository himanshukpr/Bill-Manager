import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import serverless, { type Handler } from 'serverless-http';
import { AppModule } from '../src/app.module';

let cachedHandler: Handler | null = null;

async function createHandler(): Promise<Handler> {
    const expressApp = express();
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

    app.enableCors({
        origin: '*',
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        credentials: false,
        allowedHeaders: ['Content-Type', 'Accept', 'Authorization', 'X-Requested-With', 'Origin'],
    });

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    return serverless(expressApp);
}

export default async function handler(req: any, res: any) {
    if (!cachedHandler) {
        cachedHandler = await createHandler();
    }

    return cachedHandler(req, res);
}
