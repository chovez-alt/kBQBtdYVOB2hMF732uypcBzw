import { createHash, randomBytes } from 'node:crypto';
import { get, put, BlobPreconditionFailedError } from '@vercel/blob';

const token = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const validToken = (value) => typeof value === 'string' && /^[\w-]{43}$/.test(value);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const send = (status, data) => res.status(status).json(data);
  if (req.method !== 'POST') return send(405, { error: 'Use POST' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    if (body.action === 'create') {
      const list = token();
      const key = token();
      const invite = token();
      await put('adhd/' + hash(list) + '.json', JSON.stringify({
        members: [hash(key)], invite: hash(invite), items: []
      }), { access: 'private', addRandomSuffix: false, contentType: 'application/json' });
      return send(201, { list, key, invite, items: [] });
    }
    if (!validToken(body.list) || !validToken(body.key)) return send(400, { error: 'Invalid link' });

    const path = 'adhd/' + hash(body.list) + '.json';
    const member = hash(body.key);
    for (let attempt = 0; attempt < 5; attempt++) {
      const blob = await get(path, { access: 'private', useCache: false });
      if (!blob || blob.statusCode !== 200) return send(404, { error: 'List unavailable' });
      const data = await new Response(blob.stream).json();
      if (body.action === 'join') {
        if (data.members.includes(member)) return send(200, { items: data.items });
        if (!validToken(body.invite) || data.invite !== hash(body.invite)) {
          return send(403, { error: 'Invite already used or invalid' });
        }
        data.members.push(member);
        data.invite = null;
      } else {
        if (!data.members.includes(member)) return send(403, { error: 'This device is not linked' });
        if (body.action === 'read') return send(200, { items: data.items });
        const item = body.item;
        if (!item || typeof item.id !== 'string' || !/^[\w-]{1,64}$/.test(item.id)) {
          return send(400, { error: 'Invalid reminder' });
        }
        const existing = data.items.find((entry) => entry.id === item.id);
        if (body.action === 'add') {
          if (existing) return send(200, { items: data.items });
          if (data.items.length >= 500 || typeof item.text !== 'string' || !item.text.trim() ||
              item.text.length > 2000 || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
              !/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/.test(item.time)) {
            return send(400, { error: 'Invalid reminder or list is full' });
          }
          data.items.push({ id: item.id, text: item.text.trim(), date: item.date, time: item.time, done: false });
        } else if (body.action === 'complete') {
          if (existing) existing.done = item.done === true;
        } else if (body.action === 'delete') {
          data.items = data.items.filter((entry) => entry.id !== item.id);
        } else {
          return send(400, { error: 'Invalid action' });
        }
      }
      try {
        await put(path, JSON.stringify(data), {
          access: 'private', allowOverwrite: true, ifMatch: blob.blob.etag, contentType: 'application/json'
        });
        return send(200, { items: data.items });
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    return send(503, { error: 'List is busy. Please retry.' });
  } catch (error) {
    console.error('Shared reminder request failed:', error.name);
    return send(503, { error: 'Shared reminders are temporarily unavailable' });
  }
}
