/* Menu déroulant mobile. */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('topnav');
  if (!toggle || !nav) return;

  function close() {
    toggle.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  }

  toggle.addEventListener('click', function () {
    var open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', close);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });
})();

/* Navigation interne : défilement doux sans modifier l'URL (pas de #ancre). */
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
  link.addEventListener('click', function (event) {
    var target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
    history.replaceState(null, '', window.location.pathname);
  });
});

/* Actualités corporate finance à Genève : flux RSS Bing Actualités via /api/news (gratuit, sans clé),
   présentées dans un carrousel infini, une actualité à la fois. */
(function () {
  var root = document.getElementById('news-carousel');
  var track = document.getElementById('news-track');
  var dotsEl = document.getElementById('news-dots');
  if (!root || !track) return;

  var CACHE_KEY = 'gf-news-v1';
  var CACHE_TTL = 60 * 60 * 1000; /* 1 h */
  var MAX_ITEMS = 5;
  var AUTOPLAY_MS = 6000;
  var IMAGES = [
    '/assets/news-1.jpg',
    '/assets/news-2.jpg',
    '/assets/news-3.jpg',
    '/assets/news-4.jpg'
  ];

  var slides = [];
  var index = 1; /* 1 = first real slide, once clones are in place */
  var timer = null;

  function buildSlide(item, i) {
    var slide = document.createElement('div');
    slide.className = 'carousel-slide';

    var img = document.createElement('img');
    img.src = IMAGES[i % IMAGES.length];
    img.alt = '';
    img.loading = 'lazy';
    slide.appendChild(img);

    var copy = document.createElement('div');
    copy.className = 'carousel-copy';

    var headline = document.createElement('a');
    headline.className = 'carousel-headline';
    headline.href = item.link;
    headline.target = '_blank';
    headline.rel = 'noopener noreferrer';
    headline.textContent = item.title;
    copy.appendChild(headline);

    var desc = document.createElement('p');
    desc.className = 'carousel-desc';
    desc.textContent = item.excerpt
      ? item.excerpt
      : 'Relayé par ' + item.source + (item.date ? ', le ' + item.date + '.' : '.');
    copy.appendChild(desc);

    var meta = document.createElement('span');
    meta.className = 'carousel-meta';
    meta.textContent = item.source + (item.date ? ' · ' + item.date : '');
    copy.appendChild(meta);

    slide.appendChild(copy);
    return slide;
  }

  function goTo(newIndex, instant) {
    index = newIndex;
    track.style.transition = instant ? 'none' : 'transform 0.5s ease';
    track.style.transform = 'translateX(-' + (index * 100) + '%)';
    updateDots();
  }

  function next() { goTo(index + 1, false); }
  function prev() { goTo(index - 1, false); }

  function updateDots() {
    if (!dotsEl) return;
    var real = index - 1;
    if (real < 0) real = slides.length - 1;
    if (real >= slides.length) real = 0;
    Array.prototype.forEach.call(dotsEl.children, function (dot, i) {
      dot.classList.toggle('is-active', i === real);
    });
  }

  track.addEventListener('transitionend', function () {
    if (index === 0) {
      goTo(slides.length, true);
    } else if (index === slides.length + 1) {
      goTo(1, true);
    }
  });

  function startAutoplay() {
    stopAutoplay();
    timer = setInterval(next, AUTOPLAY_MS);
  }
  function stopAutoplay() {
    if (timer) clearInterval(timer);
  }

  function render(items) {
    slides = items.map(buildSlide);
    track.innerHTML = '';

    var last = slides[slides.length - 1].cloneNode(true);
    var first = slides[0].cloneNode(true);
    track.appendChild(last);
    slides.forEach(function (s) { track.appendChild(s); });
    track.appendChild(first);

    if (dotsEl) {
      dotsEl.innerHTML = '';
      items.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'carousel-dot';
        dot.setAttribute('aria-label', 'Aller à l’actualité ' + (i + 1));
        dot.addEventListener('click', function () {
          goTo(i + 1, false);
          startAutoplay();
        });
        dotsEl.appendChild(dot);
      });
    }

    goTo(1, true);
    startAutoplay();
  }

  function showUnavailable() {
    track.innerHTML =
      '<div class="carousel-slide is-placeholder"><div class="carousel-copy">' +
      '<p class="carousel-headline">Actualités momentanément indisponibles.</p></div></div>';
    track.style.transform = 'none';
  }

  root.querySelector('.carousel-prev').addEventListener('click', function () {
    prev();
    startAutoplay();
  });
  root.querySelector('.carousel-next').addEventListener('click', function () {
    next();
    startAutoplay();
  });
  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);

  function save(items) {
    render(items);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items: items }));
    } catch (e) { /* stockage plein ou bloqué : sans conséquence */ }
  }

  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL && cached.items.length) {
      render(cached.items);
      return;
    }
  } catch (e) { /* cache illisible : on continue */ }

  /* Fonction serverless du site (même domaine, pas de CORS). */
  fetch('/api/news')
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (!data.items || !data.items.length) throw new Error('empty');
      save(data.items.slice(0, MAX_ITEMS));
    })
    .catch(showUnavailable);
})();
