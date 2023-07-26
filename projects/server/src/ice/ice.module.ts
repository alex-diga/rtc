import { Module } from '@nestjs/common';
import { IceService } from './ice.service';
import { IceGateway } from './ice.gateway';

@Module({
  providers: [IceGateway, IceService],
})
export class IceModule {}
