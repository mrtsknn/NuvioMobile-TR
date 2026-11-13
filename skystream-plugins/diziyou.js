(function () {
  // Posteri img, lazy-load data-* veya arka plan stilinden oku.
  function cardPoster(el) {
    const img = el.querySelector && el.querySelector('img');
    if (img) {
      const p = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('src');
      if (p && !p.startsWith('data:')) return p;
    }
    const lazy = el.querySelector && el.querySelector('[data-src], [data-bg], [style*="background"]');
    if (lazy) {
      const d = lazy.getAttribute('data-src') || lazy.getAttribute('data-bg');
      if (d) return d;
      const m = /url\((['"]?)([^'")]+)\1\)/.exec(lazy.getAttribute('style') || '');
      if (m) return m[2];
    }
    return null;
  }

  // Arama sonucu sayılmayacak kategori linkleri (Filmler, Diziler...).
  function isCategoryLink(r) {
    return /^(filmler|diziler|film|dizi|tümü|tum|anime|belgesel)$/i.test(String(r.title || '').trim());
  }

  // Kart başlığını rozet/puan metinleri karışmadan oku: aria-label > img alt > başlık etiketi > title.
  function cardTitle(el, titleEl) {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const strip = (s) => clean(s).replace(/\s+(full\s*hd\s*)?(izle|izleyin)$/i, '').trim();
    const aria = clean(el.getAttribute && el.getAttribute('aria-label'));
    if (aria) return strip(aria.split(/,\s*\d{4}\b/)[0]);
    const img = el.querySelector && el.querySelector('img');
    const alt = img ? strip(img.getAttribute('alt') || img.getAttribute('title')) : '';
    if (alt) return alt;
    if (titleEl && titleEl !== el) { const t = strip(titleEl.textContent); if (t) return t; }
    const attr = strip(el.getAttribute && el.getAttribute('title'));
    if (attr) return attr;
    return strip(el.textContent);
  }

  const DEFAULT_DOMAIN = 'https://www.diziyou.one';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.diziyou || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
    } catch (e) {
      return (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
    }
  }

  globalThis.getHome = async function () {
    const base = await getBaseUrl();
    const res = await http_get(base, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);
    const categories = {};
    const items = [];

    const elements = doc.querySelectorAll('div.single-item, div#list-series .single-item');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('div.baslik, a');
      const imgEl = el.querySelector('div.category_image img, img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = cardTitle(el, titleEl);
        const poster = cardPoster(el);

        items.push(new MultimediaItem({
          url: href.startsWith('http') ? href : base + href,
          title: title,
          type: 'series',
          posterUrl: poster
        }));
      }
    }

    if (items.length > 0) {
      categories['Son Eklenen Diziler'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('div.single-item, div.incontent .single-item');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('div.baslik, a');
      const imgEl = el.querySelector('div.category_image img, img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        results.push(new MultimediaItem({
          url: href.startsWith('http') ? href : base + href,
          title: cardTitle(el, titleEl),
          type: 'series',
          posterUrl: cardPoster(el)
        }));
      }
    }

    // Arama sayfası dizi değil bölüm kartları döndürür: bölüm adresinden diziye geç, tekrarları birleştir.
    if (results.length === 0) {
      const episodeLinks = doc.querySelectorAll('.listepisodes a[href]');
      for (const a of episodeLinks) {
        const href = a.getAttribute('href') || '';
        const slug = href.replace(/\/+$/, '').split('/').pop().replace(/-\d+-sezon-\d+-bolum.*$/i, '');
        if (!slug) continue;
        const showUrl = `${base}/${slug}/`;
        if (results.some((r) => r.url === showUrl)) continue;
        const nameEl = a.querySelector('#dizi-ismi, .dizi-ismi');
        const title = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : cardTitle(a, null).replace(/\s+\d+\.\s*Sezon.*$/i, '');
        results.push(new MultimediaItem({
          url: showUrl,
          title: title,
          type: 'series',
          posterUrl: cardPoster(a)
        }));
      }
    }
    return results.filter((r) => !isCategoryLink(r));
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('h1, div.baslik');
    const descEl = doc.querySelector('div.diziyou_desc, div.description');
    const imgEl = doc.querySelector('div.category_image img, .poster img');
    const poster = cardPoster(el);

    const episodes = [];
    const epElements = doc.querySelectorAll('div.bolumust, a.bolumlink, div.bolumismi, div#episodes a');

    epElements.forEach((el, index) => {
      const aTag = el.tagName === 'A' ? el : el.querySelector('a[href]');
      if (aTag) {
        const href = aTag.getAttribute('href');
        const name = el.textContent.trim();
        const sMatch = name.match(/(\d+)\.\s*Sezon/i);
        const eMatch = name.match(/(\d+)\.\s*Bölüm/i);

        episodes.push(new Episode({
          name: name || `${index + 1}. Bölüm`,
          season: sMatch ? parseInt(sMatch[1], 10) : 1,
          episode: eMatch ? parseInt(eMatch[1], 10) : (index + 1),
          url: href.startsWith('http') ? href : base + href
        }));
      }
    });

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'Dizi',
      type: 'series',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster,
      episodes: episodes
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Referer': url });
    const doc = await parseHtml(res.body || res);
    const streams = [];

    const iframes = doc.querySelectorAll('iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'DiziYou Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }
    return streams;
  };
})();

