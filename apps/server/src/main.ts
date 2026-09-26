import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { networkInterfaces } from 'os';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** 获取本机局域网 IPv4 地址（用于开发期日志与 CORS 放行） */
function getLanIps(): string[] {
  const ips: string[] = [];
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const isDev = (config.get<string>('NODE_ENV') || 'development') !== 'production';

  // 全局路由前缀 /api（与 Vite proxy、Nginx 同源化对齐）
  app.setGlobalPrefix('api');

  // CORS（文档 1.8.5）——前端走 Vite proxy 属同源；此处兜底供 Apifox/移动端/局域网直连
  // 开发环境放行 localhost 与私有网段(局域网) 来源；生产环境严格使用 CORS_ORIGIN
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: isDev
      ? (origin, callback) => {
          // 无 origin（如 curl/Apifox/同源）直接放行
          if (!origin) return callback(null, true);
          const ok =
            /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
            /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
            /^https?:\/\/(10|192\.168)\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
            /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/.test(origin);
          callback(null, ok);
        }
      : corsOrigin || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 全局参数校验（文档：ValidationPipe 校验所有入参）
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 统一响应包装 + 统一异常
  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') || 8000;
  // 监听 0.0.0.0，允许局域网直连后端
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 OMS 后端已启动:`);
  console.log(`   本机: http://localhost:${port}/api`);
  if (isDev) {
    for (const ip of getLanIps()) {
      console.log(`   局域网: http://${ip}:${port}/api`);
    }
  }
}
bootstrap();
