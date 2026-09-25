import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy }),
    { rawBody: true },
  );
  const config = app.get(ConfigService);

  // Обход несовместимости типов между версиями @nestjs/platform-fastify и @fastify/helmet
  await app.register(helmet as any, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  });

  app.enableCors({
    credentials: true,
    origin: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim()),
  });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const openApi = new DocumentBuilder()
      .setTitle('BeautyFlow CRM API')
      .setDescription('Multi-tenant BeautyFlow CRM MVP')
      .setVersion('0.1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-tenant-id' }, 'tenant')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApi));
  }

  const port = Number(config.get('PORT')) || 3001;
  await app.listen(port, '0.0.0.0');
}

void bootstrap();