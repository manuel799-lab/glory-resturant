import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PUBLIC_ORIGIN = (process.env.APP_ORIGIN ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
  (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '')
).replace(/\/$/, '');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' || Boolean(process.env.VERCEL) ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
const SECRET = process.env.SESSION_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
if (process.env.NODE_ENV === 'production' && !PUBLIC_ORIGIN) throw new Error('Set APP_ORIGIN or ensure the hosting provider supplies its public hostname.');
const PORT = Number(process.env.PORT || 4000);
const COOKIE = 'glory_session';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const cookieOptions = { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'lax' as const, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };

type AuthedRequest = Request & { auth?: { userId: string; businessId: string; role: string; email: string; name: string } };
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = PUBLIC_ORIGIN;
  if (origin && allowed && ['POST','PUT','DELETE'].includes(req.method) && origin !== allowed) return res.status(403).json({error:'Request origin is not allowed.'});
  if (origin && allowed && origin === allowed) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Credentials', 'true'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function signSession(payload: object) { return jwt.sign(payload, SECRET!, { expiresIn: '7d', issuer: 'glory-dashboard' }); }
function auth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.[COOKIE];
  if (!token) { res.status(401).json({ error: 'Please sign in to continue.' }); return; }
  void (async () => {
    try {
      const p = jwt.verify(token, SECRET!, { issuer: 'glory-dashboard' }) as any;
      if (!p.userId || !p.businessId) throw new Error('Invalid session');
      const membership = await pool.query('SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.business_id=$2', [p.userId,p.businessId]);
      if (!membership.rowCount) { res.clearCookie(COOKIE, cookieOptions); res.status(401).json({ error: 'Your access to this business workspace has been revoked.' }); return; }
      const m=membership.rows[0];
      req.auth = { userId: m.id, businessId: p.businessId, role: m.role, email: m.email, name: m.name };
      next();
    } catch (e:any) {
      if (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError') { res.clearCookie(COOKIE, cookieOptions); res.status(401).json({ error: 'Your session expired. Please sign in again.' }); return; }
      console.error(e); res.status(500).json({error:'Could not verify your workspace access.'});
    }
  })();
}
function allow(...roles: string[]) { return (req: AuthedRequest, res: Response, next: NextFunction) => roles.includes(req.auth!.role) ? next() : res.status(403).json({ error: 'You do not have permission to perform this action.' }); }
function asyncRoute(fn: (req: AuthedRequest, res: Response) => Promise<any>) { return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req as AuthedRequest, res)).catch(next); }
const registerSchema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), businessName: z.string().trim().min(2).max(120), businessType: z.string().trim().min(2).max(80).default('Other'), country: z.string().max(80).default(''), currency: z.string().length(3).default('USD'), timezone: z.string().max(80).default('UTC') });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(128) });
const recordTypes = ['expenses','revenue','jobs','inventory','suppliers'] as const;
const recordSchema = z.object({ type: z.enum(recordTypes), data: z.record(z.any()), id: z.string().uuid().optional() });
const businessSchema = z.object({ name: z.string().trim().min(2).max(120), business_type: z.string().trim().min(2).max(80), country: z.string().max(80), currency: z.string().length(3), tax_rate: z.coerce.number().min(0).max(100), timezone: z.string().max(80) });

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Health check database query failed:', error);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});
app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check the registration details.' });
  const d = parsed.data; const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM users WHERE email=$1', [d.email.toLowerCase()]);
    if (existing.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'An account with this email already exists.' }); }
    const user = await client.query('INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email', [d.name,d.email.toLowerCase(),await bcrypt.hash(d.password,12)]);
    const biz = await client.query('INSERT INTO businesses(name,business_type,country,currency,timezone) VALUES($1,$2,$3,$4,$5) RETURNING *', [d.businessName,d.businessType,d.country,d.currency,d.timezone]);
    await client.query('INSERT INTO memberships(business_id,user_id,role) VALUES($1,$2,\'owner\')', [biz.rows[0].id,user.rows[0].id]);
    await client.query('COMMIT');
    res.cookie(COOKIE, signSession({ userId:user.rows[0].id,businessId:biz.rows[0].id,role:'owner',email:user.rows[0].email,name:user.rows[0].name }), cookieOptions);
    return res.status(201).json({ user:user.rows[0], business:biz.rows[0], role:'owner' });
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));
app.post('/api/auth/login', authLimiter, asyncRoute(async (req,res) => {
  const p=loginSchema.safeParse(req.body); if(!p.success) return res.status(400).json({error:'Enter a valid email and password.'});
  const found=await pool.query(`SELECT u.id,u.name,u.email,u.password_hash,m.business_id,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1 ORDER BY (m.role='owner') DESC LIMIT 1`,[p.data.email.toLowerCase()]);
  if(!found.rowCount || !(await bcrypt.compare(p.data.password,found.rows[0].password_hash))) return res.status(401).json({error:'Email or password is incorrect.'});
  const u=found.rows[0]; res.cookie(COOKIE,signSession({userId:u.id,businessId:u.business_id,role:u.role,email:u.email,name:u.name}),cookieOptions);
  res.json({user:{id:u.id,name:u.name,email:u.email},role:u.role});
}));
app.post('/api/auth/logout',(req,res)=>{res.clearCookie(COOKIE,{...cookieOptions,maxAge:undefined});res.json({ok:true});});
app.get('/api/auth/me',auth,asyncRoute(async(req,res)=>{const a=req.auth!;const b=await pool.query('SELECT id,name,business_type,country,currency,tax_rate,timezone,created_at FROM businesses WHERE id=$1',[a.businessId]);if(!b.rowCount)return res.status(404).json({error:'Business workspace not found.'});res.json({user:{id:a.userId,name:a.name,email:a.email},business:b.rows[0],role:a.role});}));
app.get('/api/bootstrap',auth,asyncRoute(async(req,res)=>{const a=req.auth!;const [b,rr]=await Promise.all([pool.query('SELECT id,name,business_type,country,currency,tax_rate,timezone FROM businesses WHERE id=$1',[a.businessId]),pool.query('SELECT id,type,data,created_at,updated_at FROM records WHERE business_id=$1 ORDER BY created_at DESC LIMIT 2000',[a.businessId])]);if(!b.rowCount)return res.status(404).json({error:'Business workspace not found.'});const records:Record<string,any[]>={};for(const t of recordTypes)records[t]=rr.rows.filter(x=>x.type===t).map(x=>({id:x.id,...x.data,createdAt:x.created_at,updatedAt:x.updated_at}));res.json({user:{userId:a.userId,name:a.name,email:a.email,role:a.role},business:b.rows[0],records});}));
app.post('/api/records',auth,allow('owner','admin','manager','staff'),asyncRoute(async(req,res)=>{const p=recordSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0]?.message||'Invalid record.'});const {type,data,id}=p.data;const amountKeys=['amount','paidAmount','revenue','quantity','reorderLevel','cost'];for(const k of amountKeys)if(data[k]!==undefined&&(!Number.isFinite(Number(data[k]))||Number(data[k])<0))return res.status(400).json({error:`${k} must be a valid non-negative number.`});if(type==='revenue'&&data.paidAmount!==undefined&&Number(data.paidAmount)>Number(data.amount||0))return res.status(400).json({error:'Amount paid cannot exceed the sale amount.'});if(type==='suppliers'&&!String(data.name||data.title||'').trim())return res.status(400).json({error:'Supplier name is required.'});if(type!=='suppliers'&&!String(data.title||'').trim())return res.status(400).json({error:'A name or title is required.'});const a=req.auth!;if(id){const q=await pool.query('UPDATE records SET data=$1,updated_at=now() WHERE id=$2 AND business_id=$3 AND type=$4 RETURNING id,updated_at',[data,id,a.businessId,type]);if(!q.rowCount)return res.status(404).json({error:'Record not found in this business workspace.'});await pool.query('INSERT INTO audit_log(business_id,user_id,action,record_type,record_id) VALUES($1,$2,$3,$4,$5)',[a.businessId,a.userId,'update',type,id]);return res.json({id,record:data,updatedAt:q.rows[0].updated_at});}const q=await pool.query('INSERT INTO records(business_id,type,data,created_by) VALUES($1,$2,$3,$4) RETURNING id,created_at,updated_at',[a.businessId,type,data,a.userId]);await pool.query('INSERT INTO audit_log(business_id,user_id,action,record_type,record_id) VALUES($1,$2,$3,$4,$5)',[a.businessId,a.userId,'create',type,q.rows[0].id]);res.status(201).json({id:q.rows[0].id,record:data,createdAt:q.rows[0].created_at});}));
app.delete('/api/records/:type/:id',auth,allow('owner','admin','manager','staff'),asyncRoute(async(req,res)=>{if(!recordTypes.includes(req.params.type as any))return res.status(400).json({error:'Invalid record type.'});const a=req.auth!;const q=await pool.query('DELETE FROM records WHERE id=$1 AND business_id=$2 AND type=$3 RETURNING id',[req.params.id,a.businessId,req.params.type]);if(!q.rowCount)return res.status(404).json({error:'Record not found in this business workspace.'});await pool.query('INSERT INTO audit_log(business_id,user_id,action,record_type,record_id) VALUES($1,$2,$3,$4,$5)',[a.businessId,a.userId,'delete',req.params.type,req.params.id]);res.json({deleted:true});}));
app.put('/api/business',auth,allow('owner','admin'),asyncRoute(async(req,res)=>{const p=businessSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:p.error.issues[0]?.message||'Invalid business settings.'});const d=p.data;const q=await pool.query('UPDATE businesses SET name=$1,business_type=$2,country=$3,currency=$4,tax_rate=$5,timezone=$6,updated_at=now() WHERE id=$7 RETURNING id,name,business_type,country,currency,tax_rate,timezone',[d.name,d.business_type,d.country,d.currency,d.tax_rate,d.timezone,req.auth!.businessId]);res.json({business:q.rows[0]});}));
app.get('/api/team',auth,allow('owner','admin'),asyncRoute(async(req,res)=>{const q=await pool.query('SELECT u.id,u.name,u.email,m.role,m.created_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.business_id=$1 ORDER BY m.created_at',[req.auth!.businessId]);res.json({members:q.rows});}));
app.post('/api/team/invitations',auth,allow('owner','admin'),asyncRoute(async(req,res)=>{const schema=z.object({email:z.string().email(),role:z.enum(['admin','manager','staff','viewer'])});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Enter a valid email and role.'});if(p.data.role==='admin'&&req.auth!.role!=='owner')return res.status(403).json({error:'Only the owner can invite an administrator.'});const raw=randomBytes(32).toString('hex');const hash=createHash('sha256').update(raw).digest('hex');const q=await pool.query('INSERT INTO invitations(business_id,email,role,token_hash,expires_at,created_by) VALUES($1,$2,$3,$4,now()+interval \'7 days\',$5) RETURNING id,email,role,expires_at',[req.auth!.businessId,p.data.email.toLowerCase(),p.data.role,hash,req.auth!.userId]);res.status(201).json({invitation:q.rows[0],acceptUrl:`${PUBLIC_ORIGIN || 'http://localhost:5173'}/?invite=${raw}`,note:'Copy this invitation link and send it to the team member. Email delivery is not configured.'});}));
app.post('/api/team/accept',asyncRoute(async(req,res)=>{const p=z.object({token:z.string().min(32)}).safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid invitation link.'});const hash=createHash('sha256').update(p.data.token).digest('hex');const q=await pool.query('SELECT * FROM invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now()',[hash]);if(!q.rowCount)return res.status(400).json({error:'This invitation is invalid or expired.'});const inv=q.rows[0];if(!req.cookies?.[COOKIE])return res.status(401).json({error:'Create an account or sign in with the invited email, then accept the invitation.'});let payload:any;try{payload=jwt.verify(req.cookies[COOKIE],SECRET!,{issuer:'glory-dashboard'});}catch{return res.status(401).json({error:'Please sign in again.'});}const u=await pool.query('SELECT id,email FROM users WHERE id=$1',[payload.userId]);if(!u.rowCount||u.rows[0].email!==inv.email)return res.status(403).json({error:'Sign in with the email address this invitation was sent to.'});const client=await pool.connect();try{await client.query('BEGIN');await client.query('INSERT INTO memberships(business_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(business_id,user_id) DO UPDATE SET role=EXCLUDED.role',[inv.business_id,payload.userId,inv.role]);await client.query('UPDATE invitations SET accepted_at=now() WHERE id=$1',[inv.id]);const biz=await client.query('SELECT name FROM businesses WHERE id=$1',[inv.business_id]);await client.query('COMMIT');res.cookie(COOKIE,signSession({userId:payload.userId,businessId:inv.business_id,role:inv.role,email:u.rows[0].email,name:payload.name}),cookieOptions);res.json({ok:true,message:`Invitation accepted. You now have access to ${biz.rows[0]?.name||'the business workspace'}.`});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}));

app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);res.status(500).json({error:'An unexpected server error occurred.'});});
const __dirname=path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(path.resolve(__dirname, '../dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, '../dist/index.html')));
}

// Vercel imports this Express app as a serverless function. Other hosts run it as a server.
export default app;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Glory Dashboard API listening on :${PORT}`));
}
