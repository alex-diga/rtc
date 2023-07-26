import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { IceModule } from './ice/ice.module';

@Module({
  imports: [UserModule, IceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
