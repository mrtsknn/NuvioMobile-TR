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

  const DEFAULT_DOMAIN = 'https://www.setfilmizle.ltd';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.setfilm || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('.fbox, .film-box, div[class*="fbox"]');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('.fbox-title-tx, .title, h2, h3, a');
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = cardTitle(el, titleEl);
        const poster = cardPoster(el);
        const isSeries = href.includes('/dizi/');

        if (title && !items.some(i => i.url === href)) {
          items.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: isSeries ? 'series' : 'movie',
            posterUrl: poster
          }));
        }
      }
    }

    if (items.length > 0) {
      categories['Son Eklenenler'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const results = [];

    // Önce live search ajax dene, olmazsa klasik arama
    try {
      const ajaxUrl = `${base}/wp-admin/admin-ajax.php?action=stf_live_search&keyword=${encodeURIComponent(query)}`;
      const res = await http_get(ajaxUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'X-Requested-With': 'XMLHttpRequest' });
      const text = String(res.body || res);
      const doc = await parseHtml(text);

      const elements = doc.querySelectorAll('a[href]');
      for (const el of elements) {
        const href = el.getAttribute('href');
        const title = cardTitle(el, null);
        const imgEl = el.querySelector('img');
        if (href && title) {
          results.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: href.includes('/dizi/') ? 'series' : 'movie',
            posterUrl: cardPoster(el)
          }));
        }
      }
    } catch (e) {}

    if (results.length === 0) {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
      const doc = await parseHtml(res.body || res);
      const elements = doc.querySelectorAll('.fbox, .film-box, a[href*="/film/"], a[href*="/dizi/"]');
      for (const el of elements) {
        const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
        const titleEl = el.querySelector('.fbox-title-tx, h2, a') || el;
        const imgEl = el.querySelector('img');
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          const title = cardTitle(el, titleEl);
          if (href && title && !results.some(r => r.url === href)) {
            results.push(new MultimediaItem({
              url: href.startsWith('http') ? href : base + href,
              title: title,
              type: href.includes('/dizi/') ? 'series' : 'movie',
              posterUrl: cardPoster(el)
            }));
          }
        }
      }
    }
    return results.filter((r) => !isCategoryLink(r));
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('.fbox-title-tx, h1');
    const descEl = doc.querySelector('.fbox-desc, p');
    const imgEl = doc.querySelector('.poster img, img.wp-post-image, img');
    const poster = cardPoster(el);
    const isSeries = targetUrl.includes('/dizi/');

    const episodes = [];
    if (isSeries) {
      const epLinks = doc.querySelectorAll('a[href*="/sezon/"], a[href*="/bolum/"], .bolum-item a');
      epLinks.forEach((aTag, index) => {
        const href = aTag.getAttribute('href');
        const name = aTag.textContent.trim();
        const sMatch = name.match(/(\d+)\.\s*Sezon/i) || href.match(/sezon-(\d+)/i);
        const eMatch = name.match(/(\d+)\.\s*Bölüm/i) || href.match(/bolum-(\d+)/i);

        episodes.push(new Episode({
          name: name || `${index + 1}. Bölüm`,
          season: sMatch ? parseInt(sMatch[1], 10) : 1,
          episode: eMatch ? parseInt(eMatch[1], 10) : (index + 1),
          url: href.startsWith('http') ? href : base + href
        }));
      });
    }

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'SetFilm',
      type: isSeries ? 'series' : 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster,
      episodes: episodes
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Referer': url });
    const doc = await parseHtml(res.body || res);
    const streams = [];

    const iframes = doc.querySelectorAll('#stfPlayer iframe[src], iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'SetFilm Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

