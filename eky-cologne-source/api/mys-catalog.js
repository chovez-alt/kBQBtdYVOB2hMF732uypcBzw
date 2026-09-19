function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function inferGender(product) {
  const text = [product.title, product.tags, product.product_type].filter(Boolean).join(' ').toLowerCase();
  if (/\bunisex\b/.test(text)) return 'Unisex';
  if (/\b(for\s+)?women\b|\bwoman\b|\bfemale\b/.test(text)) return 'Women';
  if (/\b(for\s+)?men\b|\bman\b|\bmale\b/.test(text)) return 'Men';
  return 'Unisex';
}

function extractNotes(product) {
  const text = stripHtml(product.body_html || '');
  if (!text) return '';
  const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const noteLines = lines.filter(line => /\b(top|middle|mid|heart|base)\s+notes?\b|\bfragrance\s+notes?\b|\bnotes?\s*:/i.test(line));
  return (noteLines.length ? noteLines.join('; ') : '').slice(0, 1200);
}

async function fetchPage(page) {
  const url = `https://myswholesale.com/collections/1016_perfumes/products.json?limit=250&page=${page}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; EKY-Cologne/1.0; +https://eky-cologne.vercel.app/)'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`MYS returned ${response.status}`);
  const json = await response.json();
  if (!json || !Array.isArray(json.products)) throw new Error('MYS returned an unexpected response');
  return json.products;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  try {
    const all = [];
    const seen = new Set();

    for (let page = 1; page <= 20; page += 1) {
      const products = await fetchPage(page);
      if (!products.length) break;

      for (const product of products) {
        const key = String(product.id || product.handle || product.title || '');
        if (!key || seen.has(key)) continue;
        seen.add(key);
        all.push(product);
      }

      if (products.length < 250) break;
    }

    const products = all.map(product => ({
      name: String(product.title || '').trim(),
      notes: extractNotes(product),
      gender: inferGender(product),
      sourceId: String(product.handle || product.id || product.title || ''),
      url: product.handle ? `https://myswholesale.com/products/${product.handle}` : 'https://myswholesale.com/collections/1016_perfumes',
      publishedAt: product.published_at || product.created_at || null
    })).filter(product => product.name);

    res.status(200).json({
      products,
      count: products.length,
      source: 'MYS Wholesale 1016_perfumes'
    });
  } catch (error) {
    console.error('MYS catalog update failed:', error);
    res.status(502).json({
      error: 'Could not load the MYS perfume catalog right now.',
      detail: error && error.message ? error.message : 'Unknown error'
    });
  }
};
