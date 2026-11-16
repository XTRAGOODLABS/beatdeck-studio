// Beatdeck Link — an Ableton Link (protocol v1) peer written in plain Node.js.
// Shares tempo and beat phase with other Link apps (djay Pro, Ableton Live, Traktor…)
// on the same computer or network. No start/stop sync; tempo + beat + bar phase only.
'use strict';
const dgram = require('dgram');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const MCAST_ADDR = '224.76.78.75';
const MCAST_PORT = 20808;
const TTL = 5, TTL_RATIO = 20;                 // broadcast every 250 ms, peers expire after 5 s
const DISCOVERY_HDR = Buffer.from([0x5f,0x61,0x73,0x64,0x70,0x5f,0x76,0x01]); // "_asdp_v\x01"
const LINK_HDR      = Buffer.from([0x5f,0x6c,0x69,0x6e,0x6b,0x5f,0x76,0x01]); // "_link_v\x01"
const ALIVE = 1, RESPONSE = 2, BYEBYE = 3;
const PING = 1, PONG = 2;
const key = s => s.charCodeAt(0)<<24 | s.charCodeAt(1)<<16 | s.charCodeAt(2)<<8 | s.charCodeAt(3);
const K = { tmln:key('tmln'), sess:key('sess'), stst:key('stst'), mep4:key('mep4'), ht:key('__ht'), gt:key('__gt'), pgt:key('_pgt') };
const SESSION_EPS = 500000;

const t0 = process.hrtime.bigint();
function hostMicros(){ return Number((process.hrtime.bigint() - t0) / 1000n); }

// ---------- timeline math (mirrors Link: integer micros-per-beat, micro-beats) ----------
function mpb(bpm){ return Math.round(60e6 / bpm); }
function toBeats(tl, ghost){ return tl.beatOrigin + Math.round((ghost - tl.timeOrigin) / mpb(tl.bpm) * 1e6) / 1e6; }
function fromBeats(tl, beats){ return tl.timeOrigin + Math.round((beats - tl.beatOrigin) * mpb(tl.bpm)); }
function clampBpm(b){ return Math.min(999, Math.max(20, b)); }
function sameId(a,b){ return a && b && Buffer.compare(a,b)===0; }

// ---------- encoding ----------
function entry(k, value){ const h=Buffer.alloc(8); h.writeUInt32BE(k>>>0,0); h.writeUInt32BE(value.length,4); return Buffer.concat([h,value]); }
function i64(n){ const b=Buffer.alloc(8); b.writeBigInt64BE(BigInt(Math.round(n))); return b; }
function encTimeline(tl){ return entry(K.tmln, Buffer.concat([i64(mpb(tl.bpm)), i64(Math.round(tl.beatOrigin*1e6)), i64(tl.timeOrigin)])); }
function encStartStop(s){ return entry(K.stst, Buffer.concat([Buffer.from([s.isPlaying?1:0]), i64(Math.round(s.beats*1e6)), i64(s.timestamp)])); }
function encMep4(addr,port){ const b=Buffer.alloc(6); addr.split('.').forEach((p,i)=>b[i]=+p); b.writeUInt16BE(port,4); return entry(K.mep4,b); }
function parseEntries(buf, off){
  const out = new Map();
  while(off + 8 <= buf.length){
    const k = buf.readUInt32BE(off), size = buf.readUInt32BE(off+4), s = off+8, e = s+size;
    if(e > buf.length) throw new Error('bad payload');
    out.set(k>>0, buf.subarray(s,e)); off = e;
  }
  return out;
}
const rdI64 = (b,o=0) => Number(b.readBigInt64BE(o));

class LinkPeer extends EventEmitter {
  constructor(bpm = 120){
    super();
    this.nodeId = crypto.randomBytes(8).map(x => 33 + (x % 94)); // printable, like Link's ids
    this.sessionId = Buffer.from(this.nodeId);
    const now = hostMicros();
    this.xform = { slope:1, intercept:-now };                     // ghost = host + intercept
    this.timeline = { bpm:clampBpm(bpm), beatOrigin:0, timeOrigin:0 };
    this.startStop = { isPlaying:false, beats:0, timestamp:0 };
    this.peers = new Map();        // idHex -> {id, session, timeline, mep:{addr,port}, gw, expires}
    this.otherSessions = new Map();// sessionHex -> {id, timeline, measuring}
    this.gateways = [];
    this.enabled = false;
  }

  // ----- public api -----
  enable(){
    if(this.enabled) return; this.enabled = true;
    this._scanInterfaces();
    this._ifaceTimer = setInterval(()=>this._scanInterfaces(), 30000);
    this._broadcastTimer = setInterval(()=>this._broadcast(), TTL*1000/TTL_RATIO);
    this._pruneTimer = setInterval(()=>this._prune(), 500);
    this._remeasureTimer = setInterval(()=>this._remeasureCurrent(), 30000);
  }
  disable(){
    if(!this.enabled) return; this.enabled = false;
    [this._ifaceTimer,this._broadcastTimer,this._pruneTimer,this._remeasureTimer].forEach(clearInterval);
    for(const gw of this.gateways){ try{ this._sendDiscovery(gw, BYEBYE, 0); }catch{} this._closeGateway(gw); }
    this.gateways = []; this.peers.clear(); this.otherSessions.clear();
    this._resetState();
    this.emit('change');
  }
  numPeers(){ const s=new Set(); for(const p of this.peers.values()) if(sameId(p.session,this.sessionId)) s.add(p.id.toString('hex')); return s.size; }
  // timeline in the caller's host clock: beat(host) = beatOrigin + (host - hostOrigin)/mpb
  state(){
    const hostOrigin = Math.round((this.timeline.timeOrigin - this.xform.intercept) / this.xform.slope);
    return { enabled:this.enabled, peers:this.numPeers(), bpm:this.timeline.bpm, mpb:mpb(this.timeline.bpm),
             beatOrigin:this.timeline.beatOrigin, hostOrigin, hostNow:hostMicros() };
  }
  setTempo(bpm){
    bpm = clampBpm(bpm);
    if(Math.abs(bpm - this.timeline.bpm) < 1e-6) return;
    const g = this._ghostNow(), tl = this.timeline;
    const curBeat = toBeats(tl, g);
    const beatOrigin = Math.max(curBeat, tl.beatOrigin + 1);
    // keep the beat continuous at "now", move the origin forward so peers accept the change
    this.timeline = { bpm, beatOrigin, timeOrigin: g + Math.round((beatOrigin - curBeat) * mpb(bpm)) };
    this._broadcast(true);
    this.emit('change');
  }

  // ----- internals -----
  _ghostNow(){ return Math.round(this.xform.slope * hostMicros()) + this.xform.intercept; }
  _scanInterfaces(){
    const addrs = [];
    for(const list of Object.values(os.networkInterfaces())) for(const a of list||[]) if(a.family==='IPv4' || a.family===4) addrs.push({addr:a.address, loop:a.internal});
    const want = new Set(addrs.map(a=>a.addr));
    this.gateways = this.gateways.filter(gw => { if(want.has(gw.addr)) return true; this._closeGateway(gw); return false; });
    for(const a of addrs) if(!this.gateways.find(g=>g.addr===a.addr)) this._openGateway(a.addr, a.loop);
  }
  _openGateway(addr, loop){
    const gw = { addr, loop, ready:false };
    try{
      gw.uni = dgram.createSocket({type:'udp4', reuseAddr:true});
      gw.mc  = dgram.createSocket({type:'udp4', reuseAddr:true});
      gw.meas= dgram.createSocket({type:'udp4'});
      const onErr = () => {};
      [gw.uni,gw.mc,gw.meas].forEach(s=>s.on('error',onErr));
      gw.uni.on('message',(m,r)=>this._onDiscovery(gw,m,r));
      gw.mc.on('message',(m,r)=>this._onDiscovery(gw,m,r));
      gw.meas.on('message',(m,r)=>this._onMeasure(gw,m,r));
      let pending = 3; const done = () => { if(--pending===0){ gw.ready=true; this._broadcast(true); } };
      gw.uni.bind(0, addr, ()=>{ try{ gw.uni.setMulticastInterface(addr); gw.uni.setMulticastTTL(32); gw.uni.setMulticastLoopback(loop); gw.uni.setBroadcast(!loop); }catch{} done(); });
      gw.mc.bind(MCAST_PORT, ()=>{ try{ gw.mc.addMembership(MCAST_ADDR, addr); }catch{} done(); });
      gw.meas.bind(0, addr, ()=>{ gw.measPort = gw.meas.address().port; done(); });
      this.gateways.push(gw);
    }catch{ this._closeGateway(gw); }
  }
  _closeGateway(gw){ for(const s of [gw.uni,gw.mc,gw.meas]) try{ s && s.close(); }catch{} gw.ready=false; }

  _payload(gw){
    return Buffer.concat([encTimeline(this.timeline), entry(K.sess, Buffer.from(this.sessionId)), encStartStop(this.startStop), encMep4(gw.addr, gw.measPort||0)]);
  }
  _sendDiscovery(gw, type, ttl, to){
    if(!gw.ready) return;
    const hdr = Buffer.alloc(12); hdr[0]=type; hdr[1]=ttl; hdr.writeUInt16BE(0,2); Buffer.from(this.nodeId).copy(hdr,4);
    const msg = Buffer.concat([DISCOVERY_HDR, hdr, type===BYEBYE ? Buffer.alloc(0) : this._payload(gw)]);
    gw.uni.send(msg, to ? to.port : MCAST_PORT, to ? to.address : MCAST_ADDR);
  }
  _broadcast(){ if(!this.enabled) return; for(const gw of this.gateways) try{ this._sendDiscovery(gw, ALIVE, TTL); }catch{} }

  _onDiscovery(gw, msg, rinfo){
    if(msg.length < 20 || msg.compare(DISCOVERY_HDR,0,8,0,8)!==0) return;
    const type = msg[8], ttl = msg[9], group = msg.readUInt16BE(10), id = msg.subarray(12,20);
    if(group!==0 || sameId(id,this.nodeId)) return;
    const idHex = id.toString('hex');
    if(type===BYEBYE){ this._removePeer(idHex); return; }
    if(type!==ALIVE && type!==RESPONSE) return;
    if(type===ALIVE) try{ this._sendDiscovery(gw, RESPONSE, TTL, rinfo); }catch{}
    let e; try{ e = parseEntries(msg, 20); }catch{ return; }
    const tl = e.get(K.tmln), ss = e.get(K.sess), mep = e.get(K.mep4);
    if(!tl || tl.length<24 || !ss || ss.length!==8) return;
    const timeline = { bpm: 60e6 / rdI64(tl,0), beatOrigin: rdI64(tl,8)/1e6, timeOrigin: rdI64(tl,16) };
    const session = Buffer.from(ss);
    const peer = { id:Buffer.from(id), session, timeline, gw, expires: Date.now() + ttl*1000,
                   mep: mep && mep.length===6 ? { address:[...mep.subarray(0,4)].join('.'), port:mep.readUInt16BE(4) } : null };
    const prev = this.peers.get(idHex);
    this.peers.set(idHex, peer);
    if(!prev || !sameId(prev.session, session)) this.emit('change');
    this._sawSessionTimeline(session, timeline);
  }
  _removePeer(idHex){ if(this.peers.delete(idHex)){ this._checkAlone(); this.emit('change'); } }
  _prune(){
    const now=Date.now(); let changed=false;
    for(const [k,p] of this.peers) if(p.expires<now){ this.peers.delete(k); changed=true; }
    if(changed){ this._checkAlone(); this.emit('change'); }
  }
  _checkAlone(){
    // forget sessions nobody is in any more; if our own session emptied, start fresh (keeping the beat)
    for(const [k,s] of this.otherSessions){ if(![...this.peers.values()].some(p=>p.session.toString('hex')===k)) this.otherSessions.delete(k); }
    if(!sameId(this.sessionId,this.nodeId) && this.numPeers()===0) this._resetState();
  }
  _resetState(){
    const now = hostMicros(), beat = toBeats(this.timeline, this._ghostNow());
    this.sessionId = Buffer.from(this.nodeId);
    this.xform = { slope:1, intercept:-now };
    this.timeline = { bpm:this.timeline.bpm, beatOrigin:beat, timeOrigin:0 };
  }

  _sawSessionTimeline(session, timeline){
    if(sameId(session, this.sessionId)){
      if(timeline.beatOrigin > this.timeline.beatOrigin){
        const tempoChanged = Math.abs(timeline.bpm - this.timeline.bpm) > 1e-9;
        this.timeline = timeline;
        this.emit('change'); if(tempoChanged) this.emit('tempo', timeline.bpm);
      }
      return;
    }
    const k = session.toString('hex');
    const known = this.otherSessions.get(k);
    if(known){ if(timeline.beatOrigin > known.timeline.beatOrigin) known.timeline = timeline; return; }
    const s = { id:session, timeline, measuring:false };
    this.otherSessions.set(k, s);
    this._measureSession(s, false);
  }
  _remeasureCurrent(){
    if(sameId(this.sessionId,this.nodeId)) return;
    this._measureSession({ id:this.sessionId, timeline:this.timeline, measuring:false }, true);
  }
  _measureSession(s, isCurrent){
    const peers = [...this.peers.values()].filter(p=>sameId(p.session,s.id) && p.mep);
    if(!peers.length || s.measuring) return;
    const peer = peers.find(p=>sameId(p.id,s.id)) || peers[0];
    s.measuring = true;
    this._measure(peer, offset => {
      s.measuring = false;
      if(offset==null){ if(!isCurrent){ this.otherSessions.delete(s.id.toString('hex')); } return; }
      const xform = { slope:1, intercept:Math.round(offset) };
      if(isCurrent){ if(sameId(s.id,this.sessionId)){ this.xform = xform; this.emit('change'); } return; }
      const now = hostMicros();
      const curGhost = Math.round(this.xform.slope*now) + this.xform.intercept;
      const newGhost = now + xform.intercept;
      const diff = newGhost - curGhost;
      if(diff > SESSION_EPS || (Math.abs(diff) < SESSION_EPS && Buffer.compare(s.id, this.sessionId) < 0)){
        const old = { id:this.sessionId, timeline:this.timeline, measuring:false };
        this.otherSessions.delete(s.id.toString('hex'));
        if(!sameId(old.id,this.nodeId) || this.numPeers()>0) this.otherSessions.set(old.id.toString('hex'), old);
        const tempoChanged = Math.abs(s.timeline.bpm - this.timeline.bpm) > 1e-9;
        this.sessionId = Buffer.from(s.id); this.xform = xform; this.timeline = s.timeline;
        this._broadcast();
        this.emit('change'); if(tempoChanged) this.emit('tempo', this.timeline.bpm);
      }
    });
  }

  // ----- clock measurement (ping/pong with ghost time) -----
  _measure(peer, cb){
    const gw = peer.gw, to = peer.mep, data = [];
    let sent = 0, timer = null, finished = false;
    const finish = res => { if(finished) return; finished=true; clearTimeout(timer); gw.measHandlers && gw.measHandlers.delete(handler); cb(res); };
    const ping = extra => {
      const parts = [entry(K.ht, i64(hostMicros()))]; if(extra!=null) parts.push(entry(K.pgt, i64(extra)));
      const msg = Buffer.concat([LINK_HDR, Buffer.from([PING]), ...parts]);
      try{ gw.meas.send(msg, to.port, to.address); }catch{}
    };
    const arm = () => { clearTimeout(timer); timer = setTimeout(()=>{ if(sent++ < 5){ ping(); arm(); } else finish(null); }, 50); };
    const handler = (e, rinfo) => {
      if(rinfo.port!==to.port || rinfo.address!==to.address) return;
      const sess = e.get(K.sess), gt = e.get(K.gt), pgt = e.get(K.pgt), ht = e.get(K.ht);
      if(!sess || !sameId(sess, peer.session)){ finish(null); return; }
      const host = hostMicros();
      const ghost = gt ? rdI64(gt) : 0, prevGhost = pgt ? rdI64(pgt) : 0, prevHost = ht ? rdI64(ht) : 0;
      ping(ghost);
      if(ghost && prevHost){
        data.push(ghost - (host + prevHost)/2);
        if(prevGhost) data.push((ghost + prevGhost)/2 - prevHost);
      }
      if(data.length > 100){ data.sort((a,b)=>a-b); const n=data.length; finish(n%2 ? data[(n-1)/2] : (data[n/2-1]+data[n/2])/2); }
      else arm();
    };
    gw.measHandlers = gw.measHandlers || new Set();
    gw.measHandlers.add(handler);
    ping(); arm();
  }
  _onMeasure(gw, msg, rinfo){
    if(msg.length < 9 || msg.compare(LINK_HDR,0,8,0,8)!==0) return;
    const type = msg[8];
    let e; try{ e = parseEntries(msg, 9); }catch{ return; }
    if(type===PING){
      if(msg.length - 9 > 32) return; // HostTime + PrevGHostTime at most
      const pong = Buffer.concat([LINK_HDR, Buffer.from([PONG]), entry(K.sess, Buffer.from(this.sessionId)), entry(K.gt, i64(this._ghostNow())), msg.subarray(9)]);
      try{ gw.meas.send(pong, rinfo.port, rinfo.address); }catch{}
    } else if(type===PONG && gw.measHandlers){
      for(const h of [...gw.measHandlers]) h(e, rinfo);
    }
  }
}

module.exports = { LinkPeer, hostMicros };
