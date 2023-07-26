import { WebSocketGateway } from '@nestjs/websockets';
import { IceService } from './ice.service';

@WebSocketGateway()
export class IceGateway {
  constructor(private readonly iceService: IceService) {}
}
