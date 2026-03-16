import { Controller, Get, Res, Query } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AppService } from './app.service';
import { MetricsService } from './metrics.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly metricsService: MetricsService,
  ) {}

  // ── Your API routes go here ──────────────────
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Example test routes to generate data
  @Get('api/users')
  getUsers() {
    return [{ id: 1, name: 'Pranav' }, { id: 2, name: 'Test User' }];
  }

  @Get('api/products')
  getProducts() {
    return [{ id: 1, name: 'NestShield Pro' }, { id: 2, name: 'NestShield Free' }];
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }



  // ── NestShield dashboard routes ──────────────

  // JSON stats endpoint — used by dashboard
  @Get('nestshield/stats')
  async getStats(@Query('hours') hours?: string) {
  const h = parseInt(hours || '1');
  return this.metricsService.getStats(h);
  }

  // JSON summary endpoint
  @Get('nestshield')
  async getDashboard() {
    const stats = await this.metricsService.getStats();
    return stats.summary;
  }

  // Full dashboard UI
  @Get('nestshield/ui')
  getDashboardUI(@Res() res: Response) {
    // Try to serve from file first, fall back to inline HTML
    const filePath = path.join(__dirname, 'nestshield-dashboard.html');
    if (fs.existsSync(filePath)) {
      const html = fs.readFileSync(filePath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }
    // Inline fallback
    res.setHeader('Content-Type', 'text/html');
    res.send(this.getDashboardHtml());
  }

  
 private getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>NestShield</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script src="/socket.io/socket.io.js"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Outfit',sans-serif;background:#080b12;color:#c9d1e0;padding:20px;min-height:100vh;}
    h1{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px;}
    .sub{font-size:11px;color:#4b5a7a;margin-bottom:20px;}
    .live{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#34d399;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.2);padding:3px 10px;border-radius:20px;margin-left:8px;}
    .dot{width:6px;height:6px;border-radius:50%;background:#34d399;animation:p 1.4s infinite;}
    @keyframes p{0%,100%{opacity:1}50%{opacity:.2}}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;}
    .stat{background:#0f1624;border:1px solid #1a2035;border-radius:10px;padding:16px;position:relative;overflow:hidden;transition:border-color .2s;}
    .stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
    .stat.b::before{background:linear-gradient(90deg,#3b82f6,transparent);}
    .stat.g::before{background:linear-gradient(90deg,#34d399,transparent);}
    .stat.a::before{background:linear-gradient(90deg,#f59e0b,transparent);}
    .stat.r::before{background:linear-gradient(90deg,#f87171,transparent);}
    .stat.flash{border-color:#6366f1;}
    .slabel{font-size:10px;color:#4b5a7a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;}
    .sval{font-size:24px;font-weight:700;color:#fff;font-family:'IBM Plex Mono',monospace;}
    .row{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-bottom:14px;}
    .card{background:#0f1624;border:1px solid #1a2035;border-radius:10px;padding:16px;}
    .ctitle{font-size:11px;font-weight:600;color:#4b5a7a;text-transform:uppercase;letter-spacing:.07em;margin-bottom:14px;display:flex;justify-content:space-between;}
    .bars{display:flex;align-items:flex-end;gap:3px;height:80px;margin-bottom:6px;}
    .bar{flex:1;border-radius:3px 3px 0 0;background:rgba(59,130,246,.3);cursor:pointer;transition:background .2s;}
    .bar:hover{background:rgba(59,130,246,.7);}
    .blabels{display:flex;justify-content:space-between;}
    .blabel{font-size:9px;color:#1e2d44;font-family:'IBM Plex Mono',monospace;flex:1;text-align:center;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th{text-align:left;padding:7px 10px;color:#2a3a55;font-size:10px;text-transform:uppercase;letter-spacing:.07em;border-bottom:1px solid #1a2035;font-weight:500;}
    td{padding:9px 10px;border-bottom:1px solid #111827;color:#94a3b8;}
    tr:hover td{background:#111827;}
    tr:last-child td{border-bottom:none;}
    .m{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;padding:2px 7px;border-radius:3px;}
    .GET{background:#0d2137;color:#3b82f6;}.POST{background:#0d2015;color:#34d399;}
    .PUT{background:#1f1a05;color:#f59e0b;}.DELETE{background:#1f0d0d;color:#f87171;}
    .badge{font-size:10px;padding:2px 7px;border-radius:20px;font-family:'IBM Plex Mono',monospace;}
    .ok{background:rgba(52,211,153,.1);color:#34d399;}
    .warn{background:rgba(245,158,11,.1);color:#f59e0b;}
    .crit{background:rgba(248,113,113,.1);color:#f87171;}
    .lt{height:3px;border-radius:2px;background:#1a2035;display:inline-block;vertical-align:middle;width:56px;}
    .lf{height:3px;border-radius:2px;}
    .bottom3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
    .alert-item{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #111827;align-items:flex-start;}
    .alert-item:last-child{border-bottom:none;}
    .adot{width:7px;height:7px;border-radius:50%;margin-top:3px;flex-shrink:0;}
    .amsg{font-size:11px;color:#94a3b8;line-height:1.5;}
    .atime{font-size:10px;color:#2a3a55;font-family:'IBM Plex Mono',monospace;margin-top:2px;}
    .empty{text-align:center;padding:30px;color:#2a3a55;font-size:12px;}
    @keyframes flash{0%,100%{border-color:#1a2035}50%{border-color:#6366f1}}
    @keyframes rowIn{from{opacity:0;background:rgba(99,102,241,.1)}to{opacity:1;background:transparent}}
    .new-row td{animation:rowIn .3s ease;}

    .filter-btn {
  font-size:11px;
  font-family:'IBM Plex Mono',monospace;
  padding:4px 12px;
  border-radius:6px;
  border:1px solid #1e2d44;
  background:#111827;
  color:#4b5a7a;
  cursor:pointer;
  transition:all .15s;
}
.filter-btn:hover { color:#c9d1e0; border-color:#2a3a55; }
.filter-btn.active { color:#3b82f6; border-color:#3b82f6; background:#0d2137; }

  </style>
</head>
<body>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
  <h1>⚡ NestShield <span class="live"><span class="dot"></span>Live</span></h1>
  <div style="display:flex;gap:6px;" id="time-filters">
    <button onclick="setFilter(1)"  id="f-1"  class="filter-btn active">1h</button>
    <button onclick="setFilter(6)"  id="f-6"  class="filter-btn">6h</button>
    <button onclick="setFilter(24)" id="f-24" class="filter-btn">24h</button>
    <button onclick="setFilter(168)" id="f-168" class="filter-btn">7d</button>
  </div>
</div>
  <p class="sub" id="sub">Connecting via WebSocket...</p>

<div class="stats" style="grid-template-columns:repeat(5,1fr);">
  <div class="stat b"><div class="slabel">Total Requests</div><div class="sval" id="st">—</div></div>
  <div class="stat g"><div class="slabel">Avg Latency</div><div class="sval" id="sl">—</div></div>
  <div class="stat a"><div class="slabel">Error Rate</div><div class="sval" id="se">—</div></div>
  <div class="stat r"><div class="slabel">Unique Routes</div><div class="sval" id="sr">—</div></div>
  <div class="stat r" id="c-rl"><div class="slabel">Rate Limited</div><div class="sval" id="srl">—</div></div>
</div>

  <div class="row">
    <div class="card">
      <div class="ctitle">Request Volume <span>last 12 hours</span></div>
      <div class="bars" id="bars"></div>
      <div class="blabels" id="blabels"></div>
    </div>
    <div class="card">
      <div class="ctitle">Live Request Log <span>most recent</span></div>
      <table>
        <thead><tr><th>Method</th><th>Route</th><th>Status</th><th>ms</th><th>Time</th></tr></thead>
        <tbody id="log"></tbody>
      </table>
    </div>
  </div>

  <div class="card" style="padding:14px 0;margin-bottom:14px;">
    <div class="ctitle" style="padding:0 16px 10px;">
      All Endpoints <span id="ep-count"></span>
    </div>
    <table>
      <thead>
        <tr>
          <th>Method</th><th>Route</th><th>Requests</th>
          <th>Avg</th><th>p95</th><th>p99</th>
          <th>Errors</th><th>Error %</th><th>Last Status</th><th>Health</th>
        </tr>
      </thead>
      <tbody id="routes"></tbody>
    </table>
  </div>

  <div class="bottom3">
    <div class="card">
      <div class="ctitle">Status Breakdown</div>
      <div id="sdist"></div>
    </div>
    <div class="card">
      <div class="ctitle">Top Routes by Traffic</div>
      <div id="top-routes"></div>
    </div>
    <div class="card">
      <div class="ctitle">
        Alerts & Insights
        <span id="ac" style="font-size:10px;color:#2a3a55;font-family:'IBM Plex Mono',monospace;"></span>
      </div>
      <div id="alerts"></div>
    </div>
  </div>

  <div class="card" style="padding:14px 0;margin-bottom:14px;" id="blocked-section">
  <div class="ctitle" style="padding:0 16px 10px;">
    Blocked IPs <span id="blocked-count"></span>
  </div>
  <table>
    <thead>
      <tr>
        <th>IP Address</th>
        <th>Hits</th>
        <th>First Seen</th>
        <th>Last Seen</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody id="blocked-tbody"></tbody>
  </table>
</div>



<script>
  const socket = io();
  let currentHours = 1;

  function setFilter(hours) {
    currentHours = hours;
    [1, 6, 24, 168].forEach(h => {
      const btn = document.getElementById('f-' + h);
      if (btn) btn.classList.remove('active');
    });
    const activeBtn = document.getElementById('f-' + hours);
    if (activeBtn) activeBtn.classList.add('active');
    fetchAndRender();
  }

  async function fetchAndRender() {
    try {
      const d = await fetch('/nestshield/stats?hours=' + currentHours)
        .then(r => r.json());
      render(d);
    } catch(e) {
      document.getElementById('sub').textContent =
        'Cannot connect — is server running on port 3000?';
    }
  }

  socket.on('connect', () => {
    fetchAndRender();
  });

  socket.on('disconnect', () => {
    document.getElementById('sub').textContent = 'Reconnecting...';
  });

  socket.on('metrics-update', () => {
    fetchAndRender();
  });

  function render(d) {
    if (!d || !d.summary) return;

    const labels = { 1:'last 1 hour', 6:'last 6 hours', 24:'last 24 hours', 168:'last 7 days' };
    document.getElementById('sub').textContent =
      'Showing ' + (labels[currentHours] || 'last '+currentHours+'h') +
      ' · ' + d.summary.totalRequests + ' requests · WebSocket live';

    document.getElementById('st').textContent =
      d.summary.totalRequests.toLocaleString();
    document.getElementById('sl').innerHTML =
      d.summary.avgLatency + '<span style="font-size:14px;color:#4b5a7a;">ms</span>';
    document.getElementById('se').innerHTML =
      d.summary.errorRate + '<span style="font-size:14px;color:#4b5a7a;">%</span>';
    document.getElementById('sr').textContent = d.routes.length;
    document.getElementById('ep-count').textContent = d.routes.length + ' endpoints';

    if (d.summary.rateLimited !== undefined) {
      const rl = document.getElementById('srl');
      if (rl) rl.textContent = d.summary.rateLimited.toLocaleString();
    }

    // Bar chart
    const mxH = Math.max(...d.hourly.map(h => h.count), 1);
    document.getElementById('bars').innerHTML = d.hourly.map(h =>
      '<div class="bar" style="height:' +
      Math.max(Math.round(h.count / mxH * 100), 2) +
      '%" title="' + h.count + ' requests"></div>'
    ).join('');
    document.getElementById('blabels').innerHTML = d.hourly.map(h =>
      '<span class="blabel">' +
      (h.label || (h.hour===0?'12a':h.hour<12?h.hour+'a':h.hour===12?'12p':(h.hour-12)+'p')) +
      '</span>'
    ).join('');

    // Routes table
    const mxP = Math.max(...d.routes.map(r => r.p95Ms), 1);
    document.getElementById('routes').innerHTML = d.routes.length === 0
      ? '<tr><td colspan="10" class="empty">No requests in this time range</td></tr>'
      : d.routes.map(r => {
          const p = Math.min(Math.round(r.p95Ms / mxP * 100), 100);
          const fc = r.p95Ms>500?'#f87171':r.p95Ms>200?'#f59e0b':'#3b82f6';
          const er = r.count > 0 ? ((r.errorCount/r.count)*100).toFixed(1) : '0.0';
          const h = r.errorCount>10||r.p95Ms>1000
            ? '<span class="badge crit">critical</span>'
            : r.errorCount>0||r.p95Ms>300
            ? '<span class="badge warn">degraded</span>'
            : '<span class="badge ok">healthy</span>';
          const sc = r.lastStatus>=500?'#f87171':r.lastStatus>=400?'#f59e0b':'#34d399';
          return '<tr>' +
            '<td><span class="m '+r.method+'">'+r.method+'</span></td>' +
            '<td style="font-family:monospace;font-size:11px;color:#94a3b8;">'+r.route+'</td>' +
            '<td style="font-family:monospace;font-size:11px;">'+r.count.toLocaleString()+'</td>' +
            '<td style="font-family:monospace;font-size:11px;color:'+(r.avgMs>300?'#f59e0b':'#94a3b8')+';">'+r.avgMs+'ms</td>' +
            '<td><span style="font-family:monospace;font-size:11px;margin-right:6px;">'+r.p95Ms+'ms</span>' +
            '<span class="lt"><span class="lf" style="width:'+p+'%;background:'+fc+'"></span></span></td>' +
            '<td style="font-family:monospace;font-size:11px;color:#4b5a7a;">'+r.p99Ms+'ms</td>' +
            '<td style="font-family:monospace;font-size:11px;color:'+(r.errorCount>0?'#f87171':'#4b5a7a')+';">'+r.errorCount+'</td>' +
            '<td style="font-family:monospace;font-size:11px;color:'+(parseFloat(er)>5?'#f87171':parseFloat(er)>0?'#f59e0b':'#4b5a7a')+';">'+er+'%</td>' +
            '<td style="font-family:monospace;font-size:11px;color:'+sc+';">'+r.lastStatus+'</td>' +
            '<td>'+h+'</td>' +
          '</tr>';
        }).join('');

    // Live log
    document.getElementById('log').innerHTML = d.recent.slice(0,15).map(e => {
      const sc = e.statusCode>=500?'#f87171':e.statusCode>=400?'#f59e0b':'#34d399';
      const mc = e.duration>500?'#f87171':e.duration>200?'#f59e0b':'#4b5a7a';
      const t = new Date(e.timestamp||Date.now())
        .toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      return '<tr>' +
        '<td><span class="m '+e.method+'">'+e.method+'</span></td>' +
        '<td style="font-family:monospace;font-size:10px;color:#4b5a7a;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+e.route+'</td>' +
        '<td style="font-family:monospace;font-size:11px;color:'+sc+';">'+e.statusCode+'</td>' +
        '<td style="font-family:monospace;font-size:11px;color:'+mc+';">'+e.duration+'ms</td>' +
        '<td style="font-size:10px;color:#2a3a55;font-family:monospace;">'+t+'</td>' +
      '</tr>';
    }).join('');

    // Status dist
    const c = {s2:0,s3:0,s4:0,s5:0};
    d.recent.forEach(e => {
      if(e.statusCode<300)c.s2++;
      else if(e.statusCode<400)c.s3++;
      else if(e.statusCode<500)c.s4++;
      else c.s5++;
    });
    const tot = d.recent.length || 1;
    document.getElementById('sdist').innerHTML = [
      ['2xx Success',c.s2,'#34d399'],
      ['3xx Redirect',c.s3,'#3b82f6'],
      ['4xx Client Error',c.s4,'#f59e0b'],
      ['5xx Server Error',c.s5,'#f87171'],
    ].map(([l,v,col]) => {
      const p = Math.round(v/tot*100);
      return '<div style="margin-bottom:10px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
        '<span style="font-size:11px;color:#94a3b8;">'+l+'</span>' +
        '<span style="font-size:11px;font-family:monospace;color:'+col+';">'+v+' ('+p+'%)</span>' +
        '</div>' +
        '<div style="height:4px;border-radius:2px;background:#1a2035;">' +
        '<div style="height:4px;border-radius:2px;background:'+col+';width:'+p+'%;"></div>' +
        '</div></div>';
    }).join('');

    // Top routes
    const mxC = Math.max(...d.routes.map(r=>r.count),1);
    document.getElementById('top-routes').innerHTML = d.routes.slice(0,5).map(r => {
      const p = Math.round(r.count/mxC*100);
      return '<div style="margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">' +
        '<span style="font-size:10px;font-family:monospace;color:#4b5a7a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;">'+r.route+'</span>' +
        '<span style="font-size:10px;font-family:monospace;color:#94a3b8;">'+r.count+'</span>' +
        '</div>' +
        '<div style="height:3px;border-radius:2px;background:#1a2035;">' +
        '<div style="height:3px;border-radius:2px;background:#6366f1;width:'+p+'%;"></div>' +
        '</div></div>';
    }).join('');

    // Alerts
    const al = [];
    d.routes.forEach(r => {
      if(r.p95Ms>1000) al.push({c:'#f87171',m:r.method+' '+r.route+' p95 '+r.p95Ms+'ms — critical'});
      else if(r.p95Ms>500) al.push({c:'#f59e0b',m:r.method+' '+r.route+' p95 '+r.p95Ms+'ms — slow'});
      if(r.errorCount>20) al.push({c:'#f87171',m:r.method+' '+r.route+' has '+r.errorCount+' errors'});
    });
    if(parseFloat(d.summary.errorRate)>5)
      al.unshift({c:'#f87171',m:'Error rate '+d.summary.errorRate+'% above threshold'});
    if(d.summary.avgLatency>500)
      al.unshift({c:'#f59e0b',m:'Avg latency '+d.summary.avgLatency+'ms above 500ms'});
    if(al.length===0)
      al.push({c:'#34d399',m:'All systems healthy — no active alerts'});
    document.getElementById('ac').textContent =
      al.filter(a=>a.c!=='#34d399').length+' active';
    document.getElementById('alerts').innerHTML = al.slice(0,6).map(a =>
      '<div class="alert-item">' +
      '<div class="adot" style="background:'+a.c+'"></div>' +
      '<div><div class="amsg">'+a.m+'</div>' +
      '<div class="atime">just now</div></div>' +
      '</div>'
    ).join('');

    // Blocked IPs
    const blockedTbody = document.getElementById('blocked-tbody');
    const blockedCount = document.getElementById('blocked-count');
    if (blockedTbody) {
      const blocked = d.blockedIPs || [];
      if (blockedCount) blockedCount.textContent = blocked.length + ' IPs';
      blockedTbody.innerHTML = blocked.length === 0
        ? '<tr><td colspan="5" class="empty">No IPs blocked — system is clean</td></tr>'
        : blocked.map(b => {
            const first = new Date(b.firstSeen).toLocaleTimeString();
            const last = new Date(b.lastSeen).toLocaleTimeString();
            return '<tr>' +
              '<td style="font-family:monospace;font-size:11px;color:#f87171;">'+b.ip+'</td>' +
              '<td style="font-family:monospace;font-size:11px;color:#f87171;">'+b.hits+'</td>' +
              '<td style="font-size:11px;color:#4b5a7a;">'+first+'</td>' +
              '<td style="font-size:11px;color:#4b5a7a;">'+last+'</td>' +
              '<td><span class="badge crit">blocked</span></td>' +
            '</tr>';
          }).join('');
    }
  }

  // Start
  fetchAndRender();
  setInterval(fetchAndRender, 30000);
</script>
</body>
</html>`;
}













  
}
