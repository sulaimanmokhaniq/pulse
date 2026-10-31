import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FlagsAdminController, FlagsEvaluateController } from './flags.controller';
import { FlagsService } from './flags.service';

@Module({
  imports: [AuthModule],
  // The evaluate controller is registered first so POST /v1/flags/evaluate never reaches /:key routes.
  controllers: [FlagsEvaluateController, FlagsAdminController],
  providers: [FlagsService],
})
export class FlagsModule {}
