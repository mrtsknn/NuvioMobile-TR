(function () {
  const VOD_JSON_URL = 'https://gist.githubusercontent.com/mrtsknn/b80eb00e58cc95dc8c41d48c01aae3f8/raw/vod.json';
  const STREAM_HEADERS = {
    'User-Agent': 'googleusercontent',
    'Referer': 'https://twitter.com/'
  };

  let cachedCatalog = null;
  let cachedAt = 0;
  let byUrl = {};

  function normalizeTr(str) {
    return String(str || '')
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c');
  }

  async function getCatalog() {
    const now = Date.now();
    if (cachedCatalog && (now - cachedAt) < 10 * 60 * 1000) {
      return cachedCatalog;
    }
    const res = await http_get(VOD_JSON_URL, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const data = JSON.parse(res.body || res);
    cachedCatalog = data;
    cachedAt = now;
    byUrl = {};
    if (data && Array.isArray(data.items)) {
      for (const it of data.items) {
        if (it && it.u) {
          byUrl[it.u] = it;
        }
      }
    }
    return data;
  }

  function toItem(it) {
    return new MultimediaItem({
      url: it.u,
      title: it.t,
      type: 'movie',
      posterUrl: it.p || null,
      description: it.r ? `${it.g} • ${it.r}` : it.g
    });
  }

  globalThis.getHome = async function () {
    const data = await getCatalog();
    const categories = {};
    const items = (data && data.items) ? data.items : [];
    const LIMIT_PER_CAT = 40;

    for (const it of items) {
      const cat = it.g || 'Filmler';
      if (!categories[cat]) {
        categories[cat] = [];
      }
      if (categories[cat].length < LIMIT_PER_CAT) {
        categories[cat].push(toItem(it));
      }
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const data = await getCatalog();
    const items = (data && data.items) ? data.items : [];
    const q = normalizeTr(query).trim();
    if (!q) return [];

    const p = Math.max(1, parseInt(page || 1, 10));
    const pageSize = 30;
    const matches = [];

    for (const it of items) {
      if (normalizeTr(it.t).includes(q) || normalizeTr(it.r).includes(q)) {
        matches.push(toItem(it));
      }
    }

    const start = (p - 1) * pageSize;
    return matches.slice(start, start + pageSize);
  };

  globalThis.load = async function (url) {
    if (!byUrl[url]) {
      await getCatalog();
    }
    const it = byUrl[url];
    if (it) {
      return toItem(it);
    }
    return new MultimediaItem({
      url: url,
      title: 'Sinema Filmi',
      type: 'movie'
    });
  };

  globalThis.loadStreams = async function (url) {
    return [
      new StreamResult({
        url: url,
        source: 'RecTV Sinema HD',
        quality: '1080p',
        headers: STREAM_HEADERS
      })
    ];
  };
})();

