(function () {
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
    const res = await http_get(base, { 'User-Agent': 'Mozilla/5.0' });
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
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

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
    const searchUrl = `${base}/search?q=${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
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
          title: titleEl.textContent.trim(),
          type: 'series',
          posterUrl: imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null
        }));
      }
    }
    return results;
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('h1, div.baslik');
    const descEl = doc.querySelector('div.diziyou_desc, div.description');
    const imgEl = doc.querySelector('div.category_image img, .poster img');
    const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

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
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
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

