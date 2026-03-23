import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors();

  const port = process.env.PORT || 3006;
  await app.listen(port);

  console.log(`\n⚡ NestShield running on http://localhost:${port}`);
  console.log(`📊 Dashboard  → http://localhost:${port}/nestshield/ui`);
}
bootstrap();
