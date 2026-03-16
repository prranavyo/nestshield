import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class MetricsGateway {
  @WebSocketServer()
  server: Server;

  sendUpdate(data: any) {
    this.server.emit('metrics-update', data);
  }
}
