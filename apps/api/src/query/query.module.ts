import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';

@Module({
  imports: [AuthModule],
  controllers: [QueryController],
  providers: [QueryService],
})
export class QueryModule {}
