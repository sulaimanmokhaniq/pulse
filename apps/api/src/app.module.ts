import { DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_CONFIG, AppConfig } from './config';
import { DatabaseModule } from './db/database.module';
import { HealthController } from './health/health.controller';
import { IngestModule } from './ingest/ingest.module';
import { RedisModule } from './redis/redis.module';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const configModule: DynamicModule = {
      module: class ConfigModule {},
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
    return {
      module: AppModule,
      imports: [
        configModule,
        DatabaseModule,
        RedisModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.rateLimitPerMinute }]),
        IngestModule,
      ],
      controllers: [HealthController],
    };
  }
}
