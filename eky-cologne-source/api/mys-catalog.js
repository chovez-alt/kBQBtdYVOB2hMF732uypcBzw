module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const upstream = await fetch('https://eky-cologne.vercel.app/api/mys-catalog', {
      headers: { accept: 'application/json' }
    });
    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    res.send(body);
  } catch (error) {
    res.status(502).json({ error: 'Could not reach the MYS catalog source.' });
  }
};
