/* Fonction serverless Vercel : revue de presse corporate finance à Genève.
   Lit les flux RSS Google Actualités (Suisse, en français) et Bing Actualités
   côté serveur (gratuits, sans clé) et renvoie du JSON. Google couvre bien mieux
   la presse romande (Agefi, Bilan, Tribune de Genève, Le Temps) ; Bing apporte
   un vrai extrait d'article quand il en trouve un. */

const GOOGLE_QUERIES = [
  'rachat Genève',
  'rachète genevoise',
  'acquisition entreprise Genève',
  'levée de fonds Genève',
  'cession entreprise Genève',
  'private equity Genève'
];

const BING_QUERIES = [
  'rachat entreprise Genève',
  'acquisition Genève',
  'levée de fonds Genève'
];

const MAX_ITEMS = 5;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; /* 30 jours */
const EXCLUDE = /\b(Servette|GSHC|hockey|football|mercato|match|stage|CDI|CDD|alternance|recrute|offre d'emploi|fiduciaire|comptabilit[ée])\b/i;
const RELEVANT = /\b(Gen[eè]ve|genevois|genevoise|Geneva|L[ée]man|lémanique|romand|romande|Romandie|Carouge|Meyrin|Plan-les-Ouates|Vaud|Nyon)\b/i;
const SWISS_SOURCE = /(agefi|Bilan|Tribune de Gen[eè]ve|24 Heures|Le Temps|RTS|rts\.ch|Entreprise Romande|PME Magazine|Le Matin|Blick|ICTjournal|Heidi\.news|GHI|Le Courrier|Lematin|Watson|Finews|Allnews|Investir\.ch|Swissquote|Arcinfo|Le Nouvelliste|Keystone|swissinfo)/i;
const DEAL = /(rach[eè]t|acqui|fusion|cession|c[eè]de|reprise|repren|l[eèé]v[eé]|fonds|investiss|capital|vend|vente|financement|participation|IPO|Bourse)/i;

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function textBetween(block, tag) {
  const match = block.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  if (!match) return '';
  return decodeEntities(
    match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function realLink(bingLink) {
  const match = bingLink.match(/[?&]url=([^&]+)/);
  if (!match) return bingLink;
  try {
    return decodeURIComponent(match[1]);
  } catch (e) {
    return bingLink;
  }
}

function toItem(title, excerpt, link, source, pubDate) {
  const d = new Date(pubDate);
  return {
    title,
    excerpt,
    link,
    source,
    ts: isNaN(d) ? 0 : d.getTime(),
    date: isNaN(d) ? '' : d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
  };
}

async function fetchItems(url) {
  const upstream = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (geneve.finance news widget)' } });
  if (!upstream.ok) return [];
  const xml = await upstream.text();
  return xml.match(/<item>[\s\S]*?<\/item>/g) || [];
}

async function fetchGoogle(query) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + ' when:30d') + '&hl=fr&gl=CH&ceid=CH:fr';
  const blocks = await fetchItems(url);
  return blocks.map((block) => {
    const source = textBetween(block, 'source') || 'Presse';
    /* Google ajoute « - Source » à la fin du titre : on le retire. */
    const title = textBetween(block, 'title').replace(new RegExp('\\s+-\\s+' + source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '');
    /* Google ne fournit pas d'extrait : le carrousel affiche alors « Relayé par… ». */
    return { ...toItem(title, '', textBetween(block, 'link'), source, textBetween(block, 'pubDate')), google: true };
  });
}

async function fetchBing(query) {
  const url = 'https://www.bing.com/news/search?q=' + encodeURIComponent(query) + '&format=rss&setlang=fr-CH&cc=CH';
  const blocks = await fetchItems(url);
  return blocks.map((block) => toItem(
    textBetween(block, 'title'),
    textBetween(block, 'description'),
    realLink(textBetween(block, 'link')),
    textBetween(block, 'News:Source') || 'Presse',
    textBetween(block, 'pubDate')
  ));
}

module.exports = async function handler(req, res) {
  try {
    const results = await Promise.allSettled(
      GOOGLE_QUERIES.map(fetchGoogle).concat(BING_QUERIES.map(fetchBing))
    );
    const seenLinks = new Set();
    const seenTitles = new Set();
    const items = [];

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!item.title || !item.link) continue;
        const key = item.title.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ').trim().slice(0, 60);
        if (seenLinks.has(item.link) || seenTitles.has(key)) continue;
        if (EXCLUDE.test(item.title)) continue;
        if (!DEAL.test(item.title + ' ' + item.excerpt)) continue;
        /* On garde une actualité si elle mentionne Genève ou la Romandie, ou si
           elle vient d'un média suisse (résultats Google d'une requête « Genève »). */
        const local = RELEVANT.test(item.title + ' ' + item.excerpt);
        if (!local && !(item.google && SWISS_SOURCE.test(item.source))) continue;
        if (!item.ts || Date.now() - item.ts > MAX_AGE_MS) continue;
        seenLinks.add(item.link);
        seenTitles.add(key);
        items.push(item);
      }
    }

    items.sort((a, b) => b.ts - a.ts);
    const top = items.slice(0, MAX_ITEMS).map(({ ts, google, ...item }) => item);

    if (!top.length) throw new Error('no items');

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ items: top });
  } catch (err) {
    res.status(502).json({ items: [], error: 'feed unavailable' });
  }
};
