import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket }                    from 'socket.io';
import { DashboardAuthService }              from '../dashboard/dashboard-auth.service';

// ── SECURITY FIX: was cors: { origin: '*' } — anyone could subscribe ──────────
// Now verifies ns_token cookie on WS handshake before allowing any connection.
@WebSocketGateway({
  cors: {
    origin      : false,  // no cross-origin WS — same origin only
    credentials : true,
  },
})
export class MetricsGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly authService: DashboardAuthService) {}

  // Fires on every new WebSocket connection — reject if no valid token
  handleConnection(client: Socket): void {
    const token = this.extractToken(client);

    if (!token || !this.authService.verifyToken(token)) {
      client.emit('auth-error', 'Unauthorized');
      client.disconnect(true);
      return;
    }
  }

  sendUpdate(data: any): void {
    this.server.emit('metrics-update', data);
  }

  // Read ns_token from the socket handshake Cookie header
  private extractToken(client: Socket): string | null {
    const raw   = client.handshake?.headers?.cookie || '';
    const match = raw.match(/(?:^|;\s*)ns_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}