import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { makeApp, registerUser } from './helpers.js';

let ctx;
beforeAll(async () => { ctx = await makeApp(); });
afterAll(() => ctx.close());

describe('registration', () => {
  it('creates an account and stores only a bcrypt hash', async () => {
    const u = await registerUser(ctx.app);
    const { rows } = await ctx.db.query('SELECT password_hash FROM users WHERE id = $1', [u.user.id]);
    expect(rows[0].password_hash).not.toContain(u.body.password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(u.user).not.toHaveProperty('password_hash');
    expect(u.cookie).toMatch(/HttpOnly/i);
  });

  it('rejects a duplicate email safely without creating a second account', async () => {
    const u = await registerUser(ctx.app);
    const res = await request(ctx.app).post('/api/auth/register').send({ name: 'Dup', email: u.body.email.toUpperCase(), password: 'another-long-password' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REGISTRATION_FAILED');
    const { rows } = await ctx.db.query('SELECT count(*) AS n FROM users WHERE email = $1', [u.body.email]);
    expect(rows[0].n).toBe(1);
  });

  it.each([
    [{ name: 'A', email: 'not-an-email', password: 'long-enough-pass' }],
    [{ name: 'A', email: 'a@b.com', password: 'short' }],
    [{ name: '', email: 'a@b.com', password: 'long-enough-pass' }],
    [{ name: 'A', email: 'a@b.com', password: 'long-enough-pass', role: 'admin' }],
  ])('rejects invalid input %#', async (body) => {
    const res = await request(ctx.app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('login', () => {
  it('logs in with valid credentials', async () => {
    const u = await registerUser(ctx.app);
    const res = await request(ctx.app).post('/api/auth/login').send({ email: u.body.email, password: u.body.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const u = await registerUser(ctx.app);
    const wrong = await request(ctx.app).post('/api/auth/login').send({ email: u.body.email, password: 'wrong-password-123' });
    const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('protected access', () => {
  it.each([['get', '/api/profile'], ['get', '/api/dashboard'], ['get', '/api/interviews'], ['post', '/api/interviews']])(
    '%s %s without a token returns 401', async (method, url) => {
      const res = await request(ctx.app)[method](url).send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

  it('rejects a malformed or tampered token', async () => {
    const u = await registerUser(ctx.app);
    const res = await request(ctx.app).get('/api/profile').set('Authorization', `Bearer ${u.token}x`);
    expect(res.status).toBe(401);
  });
});

describe('refresh and logout', () => {
  const csrf = { 'X-Requested-With': 'XMLHttpRequest' };

  it('rotates refresh tokens and revokes everything when an old token is replayed', async () => {
    const u = await registerUser(ctx.app);
    const first = await request(ctx.app).post('/api/auth/refresh').set(csrf).set('Cookie', u.cookie);
    expect(first.status).toBe(200);
    const newCookie = first.headers['set-cookie'].find((c) => c.startsWith('tm_refresh='));
    expect(newCookie).not.toBe(u.cookie);

    const replay = await request(ctx.app).post('/api/auth/refresh').set(csrf).set('Cookie', u.cookie);
    expect(replay.status).toBe(401);
    const afterTheft = await request(ctx.app).post('/api/auth/refresh').set(csrf).set('Cookie', newCookie);
    expect(afterTheft.status).toBe(401);
  });

  it('requires the CSRF header and a disallowed origin is rejected', async () => {
    const u = await registerUser(ctx.app);
    expect((await request(ctx.app).post('/api/auth/refresh').set('Cookie', u.cookie)).status).toBe(403);
    expect((await request(ctx.app).post('/api/auth/refresh').set(csrf).set('Origin', 'https://evil.example').set('Cookie', u.cookie)).status).toBe(403);
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser(ctx.app);
    expect((await request(ctx.app).post('/api/auth/logout').set(csrf).set('Cookie', u.cookie)).status).toBe(204);
    expect((await request(ctx.app).post('/api/auth/refresh').set(csrf).set('Cookie', u.cookie)).status).toBe(401);
  });
});

describe('profile', () => {
  it('updates permitted fields and persists them', async () => {
    const u = await registerUser(ctx.app);
    const res = await request(ctx.app).patch('/api/profile').set(u.auth).send({ name: 'New Name', theme: 'light', preferredLanguage: 'python' });
    expect(res.status).toBe(200);
    const get = await request(ctx.app).get('/api/profile').set(u.auth);
    expect(get.body.user.name).toBe('New Name');
    expect(get.body.preferences).toEqual({ theme: 'light', preferredLanguage: 'python' });
  });

  it('refuses to change role, email, or another user id', async () => {
    const u = await registerUser(ctx.app);
    for (const body of [{ role: 'admin' }, { email: 'x@y.com' }, { id: '00000000-0000-0000-0000-000000000000' }, {}]) {
      expect((await request(ctx.app).patch('/api/profile').set(u.auth).send(body)).status).toBe(400);
    }
    const { rows } = await ctx.db.query('SELECT role FROM users WHERE id = $1', [u.user.id]);
    expect(rows[0].role).toBe('user');
  });
});
