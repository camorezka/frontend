"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

// Telegram
var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); tg.requestFullscreen();}

// ── Стабилизация высоты вьюпорта ─────────────────────────────
// В Telegram WebView высота вьюпорта (а значит и 100dvh) "доезжает"
// до финального значения с задержкой после expand()/requestFullscreen().
// Если в этот момент основной поток занят тяжёлой инициализацией
// (например, загрузкой полусотни Lottie-анимаций на экране рулетки),
// пересчёт 100dvh визуально проявляется как резкий "скачок" нижней
// панели. Фиксируем реальную высоту через CSS-переменную и обновляем
// её по событию viewportChanged — экран и панель больше не дёргаются.
function _applyTgViewportHeight() {
  var h = (tg && (tg.viewportStableHeight || tg.viewportHeight)) || window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', h + 'px');
}
_applyTgViewportHeight();
if (tg && tg.onEvent) tg.onEvent('viewportChanged', _applyTgViewportHeight);
window.addEventListener('resize', _applyTgViewportHeight);


var tgUser    = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {};
var TG_ID     = tgUser.id         || 0;
var TG_NAME   = tgUser.username   || tgUser.first_name || "user";
var TG_FIRST  = tgUser.first_name || "";
var INIT_DATA = (tg && tg.initData) ? tg.initData : "";

// Состояние
var currentTab       = "home";
var currentBetId     = null;
var payCheckAttempts = 0;
var payCheckTimer    = null;
var PAY_MAX_ATTEMPTS = 24;

// ══════════════════════════════════════════════════════════
// NFT ТИРЫ — маппинг диапазонов стоимости к видео
// ══════════════════════════════════════════════════════════
var NFT_TIERS = [
  {
    minStars: 150, maxStars: 450,
    gifts: [
      { name: "Vice Cream",    src: "photos/icecream.tgs" },
      { name: "Instant Ramen", src: "photos/sushi.tgs"    },
      { name: "Whip Cupcake",  src: "photos/cupcake.tgs"  },
      { name: "Lunar Snake",   src: "photos/snake.tgs"    },
      { name: "Tama Gadget",   src: "photos/tama.tgs"     },
      { name: "Snake Box",     src: "photos/box.tgs"      }
    ]
  },
  {
    minStars: 450, maxStars: 550,
    gifts: [
      { name: "Fresh Socks",    src: "photos/socks.tgs"    },
      { name: "Party Sparkler", src: "photos/lighting.tgs" },
      { name: "Hypno Lolipop",  src: "photos/lolipop.tgs"  },
      { name: "Easter Egg",     src: "photos/egg.tgs"      },
      { name: "Big Year",       src: "photos/year.tgs"     },
      { name: "Tama Gadget",    src: "photos/tama.tgs"     }
    ]
  },
  {
    minStars: 550, maxStars: 700,
    gifts: [
      { name: "Witch Hat",      src: "photos/koldun.tgs" },
      { name: "Stellar Rocket", src: "photos/rocket.tgs" },
      { name: "Input Key",      src: "photos/button.tgs" }
    ]
  }
];

function getNftTierByStars(stars) {
  for (var i = 0; i < NFT_TIERS.length; i++) {
    if (stars >= NFT_TIERS[i].minStars && stars <= NFT_TIERS[i].maxStars) return NFT_TIERS[i];
  }
  return NFT_TIERS[0];
}

function getRandomNftGift(stars) {
  var tier = getNftTierByStars(stars || 300);
  return tier.gifts[Math.floor(Math.random() * tier.gifts.length)];
}

// Все демо-подарки для карусели (декоративные)
var DEMO_GIFTS = [
  { name: "Diamond Ring",    tgs: "photos/ring.tgs",     stars: 50  },
  { name: "Toy Bear",        tgs: "photos/bear.tgs",     stars: 75  },
  { name: "Vice Cream",      tgs: "photos/icecream.tgs", stars: 60  },
  { name: "Party Sparkler",  tgs: "photos/lighting.tgs", stars: 120 },
  { name: "Big Year",        tgs: "photos/year.tgs",     stars: 160 },
  { name: "Stellar Rocket",  tgs: "photos/rocket.tgs",   stars: 200 },
  { name: "Fresh Socks",     tgs: "photos/socks.tgs",    stars: 40  },
  { name: "Electric Skull",  tgs: "photos/skull.tgs",    stars: 350 },
  { name: "Witch Hat",       tgs: "photos/koldun.tgs",   stars: 180 },
  { name: "Lol Pop",         tgs: "photos/lolipop.tgs",  stars: 65  },
  { name: "Trapped Heart",   tgs: "photos/heart.tgs",    stars: 90  },
  { name: "Evil Eye",        tgs: "photos/eye.tgs",      stars: 150 },
  { name: "Scared Cat",      tgs: "photos/cat.tgs",      stars: 110 },
  { name: "Input Key",       tgs: "photos/button.tgs",   stars: 80  },
  { name: "Lunar Snake",     tgs: "photos/snake.tgs",    stars: 220 },
  { name: "Astral Shard",    tgs: "photos/crystal.tgs",  stars: 300 },
  { name: "Vintage Cigar",   tgs: "photos/sigara.tgs",   stars: 130 }
];

// ══════════════════════════════════════════════════════════
// ВИДЕО — КАРУСЕЛЬ (elite smooth, zero jank)
// ══════════════════════════════════════════════════════════
var carouselRAF       = null;
var carouselPos       = 0;
var carouselSpeed     = 3.2;   // px per frame at 60fps
var carouselHalf      = 0;
var _carouselTrack    = null;  // кэшируем — не ищем в DOM каждый кадр
var _carouselLastTime = 0;
var _carouselFPS      = 60;

function cacheCarouselWidth() {
  _carouselTrack = document.getElementById("gifts-track");
  if (_carouselTrack && _carouselTrack.scrollWidth > 0) {
    carouselHalf = _carouselTrack.scrollWidth / 2;
    // Поднимаем на GPU: отдельный compositor layer, никаких layout-reflows
    _carouselTrack.style.willChange       = "transform";
    _carouselTrack.style.backfaceVisibility = "hidden";
    _carouselTrack.style.transform        = "translate3d(0,0,0)"; // force layer
    // Запрещаем сглаживание шрифтов — убирает лишние перерисовки
    _carouselTrack.style.webkitFontSmoothing = "subpixel-antialiased";
    // contain: strict говорит браузеру — внутри нет влияния на внешний layout
    _carouselTrack.style.contain = "layout style paint";
  }
}

function tickCarousel(ts) {
  if (!_carouselTrack) {
    _carouselTrack = document.getElementById("gifts-track");
    if (!_carouselTrack) { carouselRAF = requestAnimationFrame(tickCarousel); return; }
    if (_carouselTrack.scrollWidth > 0) {
      carouselHalf = _carouselTrack.scrollWidth / 2;
      cacheCarouselWidth();
    }
  }

  // Нормируем скорость по реальному delta-time — не зависит от FPS устройства
  var dt = _carouselLastTime ? Math.min(ts - _carouselLastTime, 32) : 16.67; // cap at ~30fps delta
  _carouselLastTime = ts;
  var frameSpd = carouselSpeed * (dt / 16.667); // нормировано к 60fps

  carouselPos += frameSpd;
  if (carouselHalf > 0 && carouselPos >= carouselHalf) carouselPos -= carouselHalf;

  // Округляем до 0.5px — устраняет sub-pixel shimmer на Retina
  var px = Math.round(carouselPos * 2) / 2;
  _carouselTrack.style.transform = "translate3d(-" + px + "px,0,0)";
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function startCarousel() {
  cacheCarouselWidth();
  if (carouselRAF) cancelAnimationFrame(carouselRAF);
  _carouselLastTime = 0; // сброс delta чтобы не было рывка после паузы
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function forcePlayAllVideos() {
  document.querySelectorAll("video").forEach(function(v) {
    if (!v.muted) { v.muted = true; v.volume = 0; }
    if (!v.loop)  { v.loop = true; }
    if (v.paused || v.ended) {
      var p = v.play();
      if (p && p.catch) p.catch(function() {});
    }
  });
  if (!carouselRAF) startCarousel();
}

document.addEventListener("touchstart", forcePlayAllVideos, { passive: true });

// ── Блокировка горизонтального свайпа ─────────────────────
// Предотвращает нежелательный горизонтальный скролл/свайп
// (включая жесты навигации браузера) на главной странице и
// других экранах, где нет горизонтального контента.
(function() {
  var _touchStartX = 0;
  var _touchStartY = 0;
  document.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      _touchStartX = e.touches[0].clientX;
      _touchStartY = e.touches[0].clientY;
    }
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (e.touches.length !== 1) return;
    var dx = Math.abs(e.touches[0].clientX - _touchStartX);
    var dy = Math.abs(e.touches[0].clientY - _touchStartY);
    // Если движение явно горизонтальное — блокируем
    if (dx > dy && dx > 8) {
      e.preventDefault();
    }
  }, { passive: false });
})();
document.addEventListener("click",      forcePlayAllVideos, { passive: true });

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    setTimeout(forcePlayAllVideos, 120);
  } else {
    // pause RAF when hidden to save battery
    if (carouselRAF) { cancelAnimationFrame(carouselRAF); carouselRAF = null; }
  }
});
window.addEventListener("pageshow", function() { setTimeout(forcePlayAllVideos, 120); });
window.addEventListener("focus",    function() { setTimeout(forcePlayAllVideos, 160); });

// watchdog — lighter: only fix videos, don't call loadTgsAnimations every 3s
setInterval(function() {
  if (document.visibilityState !== "visible") return;
  if (currentTab !== "spin") return;
  var anyPaused = false;
  document.querySelectorAll("#screen-spin video").forEach(function(v) { if (v.paused) anyPaused = true; });
  if (anyPaused) forcePlayAllVideos();
  if (!carouselRAF) startCarousel();
}, 4000);

// ══════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ══════════════════════════════════════════════════════════
// OWNER IDs — доступ к адмнин-панели
var ADMIN_IDS = [1693493298]; // fallback до первого ответа /stats
var isAdminUser = (TG_ID && ADMIN_IDS.indexOf(TG_ID) !== -1);

var tabScreens = {
  home:        "screen-home",
  inventory:   "screen-inventory",
  spin:        "screen-spin",
  profile:     "screen-profile",
  settings:    "screen-settings",
  referral:    "screen-referral",
  leaderboard: "screen-leaderboard",
  admin:       "screen-admin"
};

function switchTab(tab) {
  Object.keys(tabScreens).forEach(function(key) {
    var el = document.getElementById(tabScreens[key]);
    if (el) { el.style.display = "none"; el.classList.remove("active"); }
  });

  currentTab = tab;
  var el = document.getElementById(tabScreens[tab]);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }

  document.querySelectorAll(".nav-tab").forEach(function(btn) {
    btn.classList.remove("active");
    if (btn.getAttribute("data-tab") === tab) btn.classList.add("active");
  });

  haptic("light");

  if (tab === "spin" || tab === "home") {
    // Single deferred call — enough for one frame after display:flex
    requestAnimationFrame(function() {
      loadTgsAnimations();
      if (tab === "spin") forcePlayAllVideos();
    });
  }
  if (tab === "spin") {
    var spinBtnEl = document.getElementById("spin-btn");
    if (spinBtnEl) spinBtnEl.disabled = false;
  }
  if (tab === "inventory")   loadInventoryPage();
  if (tab === "profile")     { loadProfile(); loadProfileInventory(); }
  if (tab === "settings")    loadSettingsData();
  if (tab === "referral")    loadReferral();
  if (tab === "leaderboard") loadLeaderboard();
  if (tab === "admin")       loadAdminPanel();
}

// ══════════════════════════════════════════════════════════
// ЭКРАНЫ
// ══════════════════════════════════════════════════════════
var ALL_SCREENS = [
  "screen-loading", "screen-home", "screen-inventory",
  "screen-spin", "screen-profile", "screen-settings",
  "screen-referral", "screen-leaderboard",
  "screen-pay", "screen-spinning", "screen-result", "screen-error", "screen-admin"
];

function showScreen(id) {
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s) { s.style.display = "none"; s.classList.remove("active"); }
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }
  if (id === "screen-spin") { setTimeout(forcePlayAllVideos, 100); setTimeout(loadTgsAnimations, 100); }
}

function showError(title, sub, onRetry) {
  var t = document.getElementById("error-title");
  var s = document.getElementById("error-sub");
  var b = document.getElementById("error-btn");
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
  if (b) b.onclick = onRetry || function() { switchTab("spin"); };
  showScreen("screen-error");
}

var toastTmr = null;
function toast(msg) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (toastTmr) clearTimeout(toastTmr);
  toastTmr = setTimeout(function() { el.classList.remove("show"); }, 3200);
}

function haptic(type) {
  if (tg && tg.HapticFeedback) {
    try { tg.HapticFeedback.impactOccurred(type || "medium"); } catch(e) {}
  }
}

// ══════════════════════════════════════════════════════════
// API HELPER
// ══════════════════════════════════════════════════════════
function api(path, data) {
  var opts = { method: "GET", headers: { "Content-Type": "application/json" } };
  if (data !== undefined) {
    opts.method = "POST";
    opts.body   = JSON.stringify(data);
  }
  return fetch(API_URL + path, opts).then(function(r) {
    if (!r.ok) {
      return r.json().then(function(e) { throw new Error(e.detail || ("HTTP " + r.status)); });
    }
    return r.json();
  });
}

// ══════════════════════════════════════════════════════════
// ДАННЫЕ
// ══════════════════════════════════════════════════════════
function loadStarsBalance(elId) {
  if (!TG_ID) return;
  api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(s) {
      var el = document.getElementById(elId);
      if (el) el.textContent = s.stars_balance || 0;
    }).catch(function() {});
}

function renderInventoryItems(items, listId, emptyClass) {
  var list = document.getElementById(listId);
  if (!list) return;
  if (!items || items.length === 0) {
    list.innerHTML = '<div class="' + emptyClass + '">Пока пусто — крути рулетку!</div>';
    return;
  }
  list.innerHTML = items.map(function(item) {
    var icon  = item.emoji    || "🎁";
    var name  = item.nft_name || "NFT подарок";
    var stars = item.nft_stars ? item.nft_stars + "⭐" : "";
    var date  = "";
    if (item.available_at) {
      var d = new Date(item.available_at);
      date = "Выдача: " + d.toLocaleDateString("ru-RU");
    }
    return '<div class="inv-item">' +
      '<div class="inv-icon">' + icon + '</div>' +
      '<div><div class="inv-name">' + name + '</div>' +
      '<div class="inv-info">' + stars + (stars && date ? " · " : "") + date + '</div></div>' +
      '</div>';
  }).join("");
}

function loadInventoryPage() {
  loadStarsBalance("inv-stars-amount");
  if (!TG_ID) return;
  api("/inventory/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(data) { renderInventoryItems(data.items || [], "inventory-list", "inv-empty"); })
    .catch(function() {});
}

function loadProfile() {
  var uEl = document.getElementById("profile-username");
  if (uEl) uEl.textContent = "@" + TG_NAME;

  var photoEl = document.getElementById("profile-tg-photo");
  var fallbackEl = document.getElementById("profile-avatar-fallback");
  if (photoEl && tgUser && tgUser.photo_url) {
    photoEl.src = tgUser.photo_url;
    photoEl.style.display = "block";
    if (fallbackEl) fallbackEl.style.display = "none";
  } else if (photoEl) {
    api("/profile-photo/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
      .then(function(res) {
        if (res.photo_url) {
          photoEl.src = res.photo_url;
          photoEl.style.display = "block";
          if (fallbackEl) fallbackEl.style.display = "none";
        }
      }).catch(function() {});
  }

  loadStarsBalance("profile-stars-amount");
  if (!TG_ID) return;
  api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(s) {
      var total = (s.total_cycles || 0) * 5 + (s.cycle_spin || 0);
      var sc = document.getElementById("stat-cycles");
      var st = document.getElementById("stat-total");
      var sw = document.getElementById("stat-wins");
      if (sc) sc.textContent = s.total_cycles || 0;
      if (st) st.textContent = total;
      if (sw) sw.textContent = s.total_wins || 0;
    }).catch(function() {});
}

function loadProfileInventory() {
  if (!TG_ID) return;
  api("/inventory/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(data) { renderInventoryItems(data.items || [], "profile-inv-list", "inv-empty"); })
    .catch(function() {});
}

function loadSettingsData() {
  var suEl = document.getElementById("settings-username");
  if (suEl) suEl.textContent = "@" + TG_NAME;
  loadStarsBalance("settings-stars-amount");
  if (!TG_ID) return;
  api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(s) {
      var total = (s.total_cycles || 0) * 5 + (s.cycle_spin || 0);
      var ssEl = document.getElementById("settings-stats");
      if (ssEl) ssEl.textContent = total + " ставок";
    }).catch(function() {});
}

// ══════════════════════════════════════════════════════════
// АУДИО — кнопки
// ══════════════════════════════════════════════════════════
var currentHbAudio = null;
var currentHbBtn   = null;

function playHbAudio(audioId, btn) {
  var audio = document.getElementById(audioId);
  if (!audio) return;
  if (currentHbAudio === audio && !audio.paused) {
    audio.pause(); audio.currentTime = 0;
    if (currentHbBtn) { currentHbBtn.textContent = "▶"; currentHbBtn.classList.remove("playing"); }
    currentHbAudio = null; currentHbBtn = null; return;
  }
  if (currentHbAudio && !currentHbAudio.paused) {
    currentHbAudio.pause(); currentHbAudio.currentTime = 0;
    if (currentHbBtn) { currentHbBtn.textContent = "▶"; currentHbBtn.classList.remove("playing"); }
  }
  currentHbAudio = audio; currentHbBtn = btn;
  btn.textContent = "■"; btn.classList.add("playing");
  haptic("light");
  audio.play().catch(function() {});
  audio.onended = function() {
    btn.textContent = "▶"; btn.classList.remove("playing");
    currentHbAudio = null; currentHbBtn = null;
  };
}

// ══════════════════════════════════════════════════════════
// ДЕМО-РЕЖИМ
// ══════════════════════════════════════════════════════════
var demoMode = false;

function toggleDemoMode() {
  demoMode = !demoMode;
  var toggle = document.getElementById("demo-toggle");
  var spinBtn = document.getElementById("spin-btn");
  var hint    = document.querySelector(".spin-hint");
  if (toggle) toggle.classList.toggle("demo-toggle-on", demoMode);
  if (spinBtn) spinBtn.textContent = demoMode ? "Крутить рулетку" : "Крутить рулетку";
  // Запоминаем состояние демо в data-атрибуте кнопки для безопасного восстановления
  if (spinBtn) spinBtn.setAttribute("data-demo", demoMode ? "1" : "0");
  if (hint)   hint.textContent    = demoMode ? "Прокрути рулетку чтобы сорвать куш!" : "Прокрути рулетку чтобы сорвать куш!";
}

// ══════════════════════════════════════════════════════════
// АНИМАЦИЯ ТРЕКА
// ══════════════════════════════════════════════════════════
var spinAnimRAF = null;

// ══════════════════════════════════════════════════════════
// ЭФФЕКТ ЗВЁЗД (падают при проигрыше/до НФТ)
// ══════════════════════════════════════════════════════════
function showStarsEffect(count, onDone) {
  var starCount = count || 2;
  var container = document.createElement("div");
  container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:400;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;";

  // Картинка stars.png в центре
  var img = document.createElement("img");
  img.src = "photos/stars.png";
  img.style.cssText = "width:120px;height:120px;object-fit:contain;animation:stars-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);";
  container.appendChild(img);

  var label = document.createElement("div");
  label.style.cssText = "font-family:Unbounded,sans-serif;font-size:28px;font-weight:900;color:#ffffff;text-shadow:0 0 20px rgba(255,255,255,0.5);animation:stars-pop 0.5s cubic-bezier(0.34,1.56,0.64,1);";
  label.textContent = starCount + " ⭐";
  container.appendChild(label);

  // Добавляем стили анимации если ещё нет
  if (!document.getElementById("stars-anim-style")) {
    var st = document.createElement("style");
    st.id = "stars-anim-style";
    st.textContent = "@keyframes stars-pop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}";
    document.head.appendChild(st);
  }

  // Тёмный оверлей под звёздами
  var overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:399;pointer-events:none;";
  document.body.appendChild(overlay);
  document.body.appendChild(container);

  confetti();
  haptic("heavy");

  // Фейерверк частиц
  setTimeout(function() {
    fireParticles();
  }, 200);

  setTimeout(function() {
    container.style.transition = "opacity 0.4s";
    overlay.style.transition   = "opacity 0.4s";
    container.style.opacity = "0";
    overlay.style.opacity   = "0";
    setTimeout(function() {
      container.remove();
      overlay.remove();
      if (onDone) onDone();
    }, 400);
  }, 2000);
}

function fireParticles() {
  var colors = ["#ffffff","#cfcfcf","#A8FF78","#B388FF","#5dbcff"];
  for (var i = 0; i < 40; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement("div");
        p.className = "confetti-p";
        var fromRight = idx >= 20;
        var color = colors[Math.floor(Math.random() * colors.length)];
        var w = 6 + Math.random() * 8;
        var h = 6 + Math.random() * 8;
        var dur = 1.0 + Math.random() * 0.8;
        var rot = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
        var xPct = fromRight ? (70 + Math.random() * 30) : (Math.random() * 30);
        var vx = fromRight ? -(20 + Math.random() * 60) : (20 + Math.random() * 60);
        p.style.cssText = [
          "width:"+w+"px","height:"+h+"px",
          "background:"+color,"left:"+xPct+"%",
          "--cx:"+vx+"px","--cr:"+rot+"deg",
          "animation-duration:"+dur+"s",
          "border-radius:50%"
        ].join(";");
        document.body.appendChild(p);
        setTimeout(function() { p.remove(); }, (dur + 0.2) * 1000);
      }, idx * 25);
    })(i);
  }
}

// ══════════════════════════════════════════════════════════
// ГЛАВНАЯ АНИМАЦИЯ СПИНА — тап для разгона
// ══════════════════════════════════════════════════════════
var TAPS_NEEDED   = 4;     // сколько кликов нужно чтобы разогнать
var SPIN_DURATION = 5500;  // итоговая длительность замедления, мс
var REVEAL_BEFORE_END = 3000; // за сколько мс до остановки раскрывать все крутящиеся подарки

function _buildSpinItems(withStar) {
  // Берём TGS-источники из основной карусели
  var srcs = [];
  document.querySelectorAll("#gifts-track .tgs-container").forEach(function(tgs) {
    var src = tgs.getAttribute("data-tgs");
    if (src && srcs.indexOf(src) === -1) srcs.push(src);
  });
  if (!srcs.length) {
    DEMO_GIFTS.forEach(function(g) { srcs.push(g.tgs); });
  }

  var items = [];
  // Берём 12 случайных TGS для одного "круга"
  var pool = srcs.slice();
  for (var i = pool.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  var setLen = Math.min(12, pool.length);
  for (var k = 0; k < setLen; k++) items.push({ type: "tgs", src: pool[k] });

  if (withStar) {
    var starPos = 1 + Math.floor(Math.random() * (items.length - 2));
    items.splice(starPos, 0, { type: "star" });
  }
  return items;
}

function _renderSpinItem(item, revealTgs) {
  if (item.type === "star") {
    if (!revealTgs) {
      return '<div class="spin-overlay-item spin-spin-placeholder" style="background:#0d2a45;border:1.5px solid rgba(93,188,255,0.22);">' +
               '<div class="spin-placeholder-inner"></div>' +
             '</div>';
    }
    return '<div class="spin-overlay-item spin-overlay-star">' +
             '<img src="photos/stars.png" alt="star"/>' +
           '</div>';
  }
  if (revealTgs) {
    return '<div class="spin-overlay-item">' +
             '<div class="tgs-container" data-tgs="' + item.src + '" style="width:100%;height:100%;"></div>' +
           '</div>';
  }
  return '<div class="spin-overlay-item spin-spin-placeholder" style="background:#0d2a45;border:1.5px solid rgba(93,188,255,0.22);">' +
           '<div class="spin-placeholder-inner"></div>' +
         '</div>';
}

// onDone(winIdx) — вызывается после остановки.
// withStarItem — если true, в линию подсовывается одна звёздочка (stars.png)
function startSpinAnimation(onDone, withStarItem) {
  if (carouselRAF) { cancelAnimationFrame(carouselRAF); carouselRAF = null; }
  if (spinAnimRAF) { cancelAnimationFrame(spinAnimRAF); spinAnimRAF = null; }

  // ── Оверлей с блюром фона ──────────────────────────────
  var blurBg = document.createElement("div");
  blurBg.id = "spin-blur-bg";
  blurBg.style.cssText =
    "position:fixed;inset:0;z-index:198;" +
    "backdrop-filter:blur(18px) brightness(0.45);" +
    "-webkit-backdrop-filter:blur(18px) brightness(0.45);" +
    "background:rgba(0,0,0,0.35);opacity:0;transition:opacity .25s;";
  document.body.appendChild(blurBg);

  var overlay = document.createElement("div");
  overlay.id = "spin-overlay";
  overlay.style.cssText =
    "position:fixed;top:50%;left:0;right:0;height:200px;" +
    "transform:translateY(-50%) scale(0.92);z-index:200;" +
    "display:flex;align-items:center;overflow:hidden;" +
    "opacity:0;transition:opacity .25s, transform .25s;";

  var track = document.createElement("div");
  track.id = "spin-overlay-track";
  track.style.cssText = "display:flex;gap:12px;flex-shrink:0;will-change:transform;padding-left:50vw;";

  var items = _buildSpinItems(!!withStarItem);
  // Если withStarItem=true (NFT не выпал, звёзды) — winIdx должен указывать на звёздочку
  // Если withStarItem=false (NFT) — winIdx указывает на любой tgs-элемент (не звёздочку)
  var winIdx;
  if (withStarItem) {
    // Находим индекс звёздочки в массиве
    var starIndex = -1;
    for (var si = 0; si < items.length; si++) {
      if (items[si].type === "star") { starIndex = si; break; }
    }
    winIdx = starIndex >= 0 ? starIndex : Math.floor(Math.random() * items.length);
  } else {
    // NFT — случайный tgs элемент (не звёздочку)
    var tgsIndices = [];
    for (var ti = 0; ti < items.length; ti++) {
      if (items[ti].type !== "star") tgsIndices.push(ti);
    }
    winIdx = tgsIndices.length > 0
      ? tgsIndices[Math.floor(Math.random() * tgsIndices.length)]
      : Math.floor(Math.random() * items.length);
  }

  // Дублируем набор несколько раз для длинной прокрутки
  var REPEATS = 6;
  var html = "";
  for (var r = 0; r < REPEATS; r++) {
    for (var i = 0; i < items.length; i++) html += _renderSpinItem(items[i], false);
  }
  track.innerHTML = html;
  overlay.appendChild(track);
  document.body.appendChild(overlay);

  // Тап-зона
  var tapZone = document.createElement("div");
  tapZone.id = "spin-tap-zone";
  tapZone.style.cssText = "position:fixed;inset:0;z-index:201;";
  document.body.appendChild(tapZone);

  var hint = document.createElement("div");
  hint.id = "spin-tap-hint";
  hint.style.cssText =
    "position:fixed;bottom:18%;left:0;right:0;text-align:center;z-index:202;" +
    "font-family:Unbounded,sans-serif;font-size:14px;font-weight:700;color:#fff;" +
    "text-shadow:0 2px 12px rgba(0,0,0,0.6);opacity:0;transition:opacity .3s;" +
    "pointer-events:none;";
  hint.textContent = "Кликай, чтобы разогнать!";
  document.body.appendChild(hint);

  requestAnimationFrame(function() {
    blurBg.style.opacity  = "1";
    overlay.style.opacity = "1";
    overlay.style.transform = "translateY(-50%) scale(1)";
    hint.style.opacity = "1";
  });

  // TGS не грузим пока крутится — только видео в основной карусели
  setTimeout(function() {
    forcePlayAllVideos();
  }, 60);

  // ── Геометрия ───────────────────────────────────────────
  function itemWidth() {
    var first = track.children[0];
    if (!first) return 202;
    return first.offsetWidth + 12;
  }

  var itemW       = itemWidth();
  var setW        = itemW * items.length;
  var winCenter    = winIdx * itemW + itemW / 2;

  var pos        = 0;
  var taps       = 0;
  var phase      = "wait"; // wait -> spinning -> decel -> done
  var speed      = 0;
  var BASE_SPEED = 8;
  var SPEED_STEP = 11;
  var MAX_SPEED  = BASE_SPEED + SPEED_STEP * TAPS_NEEDED;
  var decelStart = null;
  var target     = 0;

  function onTap() {
    if (phase === "done" || phase === "decel") return;
    if (taps >= TAPS_NEEDED) return;
    taps++;
    haptic("medium");
    if (phase === "wait") {
      phase = "spinning";
      hint.style.opacity = "0";
    }
    speed = BASE_SPEED + SPEED_STEP * taps;
    if (taps >= TAPS_NEEDED) {
      // Запускаем замедление через SPIN_DURATION
      tapZone.style.pointerEvents = "none";
      // Ставим winIdx в определённом повторе чтобы гарантировать остановку в центре
      // Целимся строго в последний повтор (REPEATS-1 = 5)
      // чтобы winElemIdx при раскрытии TGS совпал с реальной позицией
      var targetRepeat = REPEATS - 1;
      var targetBase   = targetRepeat * setW;
      target = targetBase + winCenter;
      // Гарантируем что target впереди текущей позиции минимум на 3 оборота
      while (target < pos + 3 * setW) target += setW;
      decelStart = performance.now();
      decelFromPos = pos;
      decelFromSpeed = speed;
      phase = "decel";
    }
  }
  tapZone.addEventListener("pointerdown", onTap);

  var decelFromPos = 0, decelFromSpeed = 0;
  var revealed = false;

  // Раскрываем все крутящиеся элементы: заменяем плейсхолдеры на настоящие
  // TGS-анимации/звёздочку. Делается заранее (за REVEAL_BEFORE_END мс до
  // остановки), чтобы анимации успели прогрузиться и проиграться к моменту,
  // когда барабан остановится по центру.
  function revealAllItems() {
    if (revealed) return;
    revealed = true;

    var overlayRect = overlay.getBoundingClientRect();
    var centerX = overlayRect.left + overlayRect.width / 2;
    var REVEAL_HALF_WIDTH = overlayRect.width * 0.9;

    // Собираем плейсхолдеры в зоне видимости — и слева, и справа
    var allItems = [];
    for (var idx = 0; idx < track.children.length; idx++) {
      var el = track.children[idx];
      if (!el.classList.contains("spin-spin-placeholder")) continue;
      var rect = el.getBoundingClientRect();
      var elCx = rect.left + rect.width / 2;
      var dist = Math.abs(elCx - centerX);
      if (dist <= REVEAL_HALF_WIDTH) {
        allItems.push({ el: el, item: items[idx % items.length], dist: dist });
      }
    }

    // От центра к краям — центральные появляются первыми
    allItems.sort(function(a, b) { return a.dist - b.dist; });

    allItems.forEach(function(entry, i) {
      setTimeout(function() {
        var el = entry.el;
        if (!el.parentNode) return;

        var revealedHtml = _renderSpinItem(entry.item, true);
        var tmp = document.createElement("div");
        tmp.innerHTML = revealedHtml;
        var newChild = tmp.firstChild;
        if (!newChild) return;

        // Плавное появление: opacity + лёгкий scale с пружинным ease
        newChild.style.opacity = "0";
        newChild.style.transform = "scale(0.88)";
        newChild.style.transition = "opacity 0.28s ease, transform 0.28s cubic-bezier(0.34,1.3,0.64,1)";
        el.parentNode.replaceChild(newChild, el);

        var tgsContainer = newChild.querySelector ? newChild.querySelector(".tgs-container") : null;
        if (tgsContainer) {
          _revealOneTgs(tgsContainer, function() {
            requestAnimationFrame(function() {
              newChild.style.opacity = "1";
              newChild.style.transform = "scale(1)";
            });
          });
        } else {
          requestAnimationFrame(function() {
            newChild.style.opacity = "1";
            newChild.style.transform = "scale(1)";
          });
        }
      }, i * 45);
    });
  }

  // Инициализирует один tgs-контейнер, вызывает onReady после первого кадра
  function _revealOneTgs(container, onReady) {
    var src = container.getAttribute("data-tgs");
    if (!src) { if (onReady) onReady(); return; }
    if (container._tgsLoaded) { if (onReady) onReady(); return; }
    container._tgsLoaded = true;

    function _initWithJson(json) {
      container.innerHTML = "";
      var anim = lottie.loadAnimation({
        container: container,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData: json,
        rendererSettings: { progressiveLoad: true, hideOnTransparent: true, viewBoxOnly: true }
      });
      try { anim.setSubframe(false); } catch(e) {}
      _lottieAnims.set(container, anim);
      if (_tgsVisibilityObserver) _tgsVisibilityObserver.observe(container);
      anim.addEventListener("enterFrame", function onFirst() {
        anim.removeEventListener("enterFrame", onFirst);
        try { anim.resize(); } catch(e) {}
        _tgsRunning--;
        _tgsProcessQueue();
        if (onReady) onReady();
      });
    }

    if (_tgsCache[src]) {
      _tgsRunning++;
      _initWithJson(_tgsCache[src]);
      return;
    }

    fetch(src)
      .then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function(buf) {
        var uint8 = new Uint8Array(buf);
        var json;
        try {
          var decompressed = pako.inflate(uint8);
          json = JSON.parse(new TextDecoder("utf-8").decode(decompressed));
        } catch(e) {
          try { json = JSON.parse(new TextDecoder("utf-8").decode(uint8)); }
          catch(e2) { container._tgsLoaded = false; if (onReady) onReady(); return; }
        }
        _tgsCache[src] = json;
        _tgsRunning++;
        _initWithJson(json);
      })
      .catch(function() { container._tgsLoaded = false; if (onReady) onReady(); });
  }

  function tick() {
    if (phase === "wait") {
      // Лёгкое покачивание/медленный ход в ожидании тапов
      speed = 0.8;
      pos += speed;
      if (setW > 0 && pos >= setW) pos -= setW;
      track.style.transform = "translate3d(-" + pos + "px,0,0)";
      spinAnimRAF = requestAnimationFrame(tick);
      return;
    }
    if (phase === "spinning") {
      pos += speed;
      if (setW > 0 && pos >= setW) pos -= setW;
      track.style.transform = "translate3d(-" + pos + "px,0,0)";
      spinAnimRAF = requestAnimationFrame(tick);
      return;
    }
    if (phase === "decel") {
      var elapsed  = performance.now() - decelStart;
      var progress = Math.min(elapsed / SPIN_DURATION, 1);
      // quintic ease-out — плавное замедление без рывков
      var ease     = 1 - Math.pow(1 - progress, 5);
      pos = decelFromPos + (target - decelFromPos) * ease;
      track.style.transform = "translate3d(-" + pos + "px,0,0)";
      // Раскрываем все крутящиеся подарки заранее (за 2 сек до остановки),
      // чтобы анимации успели загрузиться и проиграться до того, как барабан встанет
      if (!revealed && elapsed >= SPIN_DURATION - REVEAL_BEFORE_END) {
        revealAllItems();
      }
      if (progress >= 1) {
        pos = target;
        track.style.transform = "translate3d(-" + pos + "px,0,0)";
        phase = "done";
        haptic("heavy");
        revealAllItems();
        setTimeout(function() {
          _teardownSpinOverlay(blurBg, overlay, tapZone, hint);
          if (onDone) onDone(winIdx, items[winIdx]);
        }, 600);
        return;
      }
      spinAnimRAF = requestAnimationFrame(tick);
      return;
    }
  }
  spinAnimRAF = requestAnimationFrame(tick);

  return winIdx;
}

function _teardownSpinOverlay(blurBg, overlay, tapZone, hint) {
  // останавливаем и освобождаем все Lottie-анимации оверлея —
  // иначе при каждой новой прокрутке копится 70+ "мёртвых" инстансов
  _tgsCleanupScope(overlay);
  [blurBg, overlay, tapZone, hint].forEach(function(el) {
    if (!el) return;
    el.style.transition = "opacity .25s";
    el.style.opacity = "0";
    setTimeout(function() { el.remove(); }, 260);
  });
  setTimeout(startCarousel, 280);
}

// ══════════════════════════════════════════════════════════
// ПОКАЗ NFT ВИДЕО (оверлей с видео)
// ══════════════════════════════════════════════════════════
function showNftVideoOverlay(gift, isDemo, onClose) {
  var existing = document.getElementById("nft-video-overlay");
  if (existing) existing.remove();

  var ov = document.createElement("div");
  ov.id = "nft-video-overlay";
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:500;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;";

  var badge = isDemo
    ? '<div style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-family:Unbounded,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 16px;border-radius:20px;text-transform:uppercase;">Демо</div>'
    : '<div style="background:linear-gradient(135deg,#ffffff,#cfcfcf);color:#000;font-family:Unbounded,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 16px;border-radius:20px;text-transform:uppercase;">Выигрыш</div>';

  ov.innerHTML = badge +
    '<video src="' + gift.src + '" autoplay loop muted playsinline ' +
    'style="width:240px;height:240px;border-radius:28px;object-fit:cover;' +
    'border:2px solid rgba(255,255,255,0.5);box-shadow:0 0 60px rgba(255,255,255,0.3);"></video>' +
    '<div style="font-family:Unbounded,sans-serif;font-size:22px;font-weight:900;color:#ffffff;text-align:center;">' +
      gift.name + '</div>' +
    (isDemo ? '<div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center;">Демо-режим · без реальной ставки</div>' : '') +
    '<button id="nft-ov-close" style="width:100%;max-width:320px;padding:16px;border-radius:18px;border:none;' +
    'background:linear-gradient(135deg,#fff 0%,rgba(255,255,255,.85) 100%);' +
    'font-family:Unbounded,sans-serif;font-size:14px;font-weight:700;color:#000;cursor:pointer;' +
    'box-shadow:0 4px 20px rgba(255,255,255,0.15);">' +
    (isDemo ? 'Крутить по-настоящему' : 'Забрать!') + '</button>' +
    (isDemo ? '<button id="nft-ov-demo-again" style="width:100%;max-width:320px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.2);' +
    'background:rgba(255,255,255,0.06);font-family:Unbounded,sans-serif;font-size:13px;' +
    'font-weight:600;color:rgba(255,255,255,0.55);cursor:pointer;">Ещё раз (демо)</button>' : '');

  document.body.appendChild(ov);

  var closeBtn = document.getElementById("nft-ov-close");
  if (closeBtn) closeBtn.onclick = function() {
    ov.remove();
    if (isDemo) toggleDemoMode();
    if (onClose) onClose();
  };
  var againBtn = document.getElementById("nft-ov-demo-again");
  if (againBtn) againBtn.onclick = function() {
    ov.remove();
    onDemoSpin();
  };
}

// ══════════════════════════════════════════════════════════
// ДЕМО-СПИН
// Логика: каждые 1-2 круткИ показывает NFT (рандомно),
// в остальных — падают звёзды (1–4)
// ══════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════
// ОВЕРЛЕЙ РЕЗУЛЬТАТА С TGS-АНИМАЦИЕЙ
// Показывает тот же подарок, что остановился по центру рулетки
// ══════════════════════════════════════════════════════════
function showNftTgsResultOverlay(gift, isDemo, onClose) {
  var existing = document.getElementById("nft-tgs-result-overlay");
  if (existing) existing.remove();

  var ov = document.createElement("div");
  ov.id = "nft-tgs-result-overlay";
  ov.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.93);z-index:500;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:18px;padding:28px;";

  var badge = isDemo
    ? '<div style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;font-family:Unbounded,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 16px;border-radius:20px;text-transform:uppercase;">Демо</div>'
    : '<div style="background:linear-gradient(135deg,#ffffff,#cfcfcf);color:#000;font-family:Unbounded,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:5px 16px;border-radius:20px;text-transform:uppercase;">Выигрыш</div>';

  var tgsSrc = gift.tgs || gift.src || "";

  ov.innerHTML =
    badge +
    '<div id="nft-tgs-res-wrap" style="width:220px;height:220px;border-radius:28px;' +
    'border:2px solid rgba(255,255,255,0.18);overflow:hidden;background:rgba(255,255,255,0.04);' +
    'box-shadow:0 0 60px rgba(93,188,255,0.25);display:flex;align-items:center;justify-content:center;">' +
      '<div class="tgs-container" data-tgs="' + tgsSrc + '" style="width:100%;height:100%;"></div>' +
    '</div>' +
    '<div style="font-family:Unbounded,sans-serif;font-size:22px;font-weight:900;color:#fff;text-align:center;letter-spacing:0.3px;">' +
      gift.name +
    '</div>' +
    (isDemo ? '<div style="font-size:12px;color:rgba(255,255,255,0.4);text-align:center;">Демо-режим</div>' : '') +
    '<button id="nft-tgs-ov-close" style="width:100%;max-width:320px;padding:16px;border-radius:18px;border:none;' +
    'background:linear-gradient(135deg,rgba(93,188,255,1) 0%,rgba(60,160,255,1) 100%);' +
    'font-family:Unbounded,sans-serif;font-size:14px;font-weight:700;color:#001a2e;cursor:pointer;' +
    'box-shadow:0 4px 24px rgba(93,188,255,0.35);">' +
    (isDemo ? "Крутить рулетку" : "Забрать!") + "</button>" +
    (isDemo ? '<button id="nft-tgs-ov-again" style="width:100%;max-width:320px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(255,255,255,0.05);font-family:Unbounded,sans-serif;font-size:13px;' +
    'font-weight:600;color:rgba(255,255,255,0.50);cursor:pointer;">Ещё раз (демо)</button>' : '');

  document.body.appendChild(ov);

  // Загружаем TGS-анимацию
  setTimeout(function() { loadTgsAnimations(); }, 60);

  var closeBtn = document.getElementById("nft-tgs-ov-close");
  if (closeBtn) closeBtn.onclick = function() {
    ov.remove();
    if (isDemo) { if (typeof toggleDemoMode === 'function') toggleDemoMode(); }
    if (onClose) onClose();
  };
  var againBtn = document.getElementById("nft-tgs-ov-again");
  if (againBtn) againBtn.onclick = function() { ov.remove(); onDemoSpin(); };
}

var demoCycleCount = 0; // счётчик демо-прокруток

function onDemoSpin() {
  var spinBtn = document.getElementById("spin-btn");
  var btnWrap = document.getElementById("spin-btn-wrap");

  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s) { s.style.display = "none"; s.classList.remove("active"); }
  });
  var spinEl = document.getElementById("screen-spin");
  if (spinEl) { spinEl.style.display = "flex"; spinEl.classList.add("active"); }
  currentTab = "spin";

  if (btnWrap) btnWrap.style.opacity = "0";
  if (spinBtn) spinBtn.disabled = true;

  // Демо-шансы: 80% NFT-подарок, 20% звёзды
  var showNft = Math.random() < 0.80;

  startSpinAnimation(function(wIdx, winItem) {
    demoCycleCount++;
    if (btnWrap) btnWrap.style.opacity = "";
    if (spinBtn) { spinBtn.disabled = false; spinBtn.textContent = demoMode ? "Демо-прокрутка" : "Крутить рулетку"; }

    if (showNft && winItem && winItem.type === "tgs") {
      // Найти подарок точно по TGS-src остановившегося элемента
      var gift = null;
      var winSrc = winItem.src || "";
      for (var di = 0; di < DEMO_GIFTS.length; di++) {
        if (DEMO_GIFTS[di].tgs === winSrc) { gift = DEMO_GIFTS[di]; break; }
      }
      // Fallback: если карусель содержит src которого нет в DEMO_GIFTS
      if (!gift && winSrc) {
        gift = { name: winSrc.split('/').pop().replace('.tgs',''), tgs: winSrc, stars: 0 };
      }
      if (!gift) gift = DEMO_GIFTS[Math.floor(Math.random() * DEMO_GIFTS.length)];
      confetti();
      haptic("heavy");
      showNftTgsResultOverlay(gift, true, null);
    } else {
      // Показать звёзды (1–8)
      var starCount = 1 + Math.floor(Math.random() * 8);
      showStarsEffect(starCount, null);
    }
  }, !showNft);
}

// ══════════════════════════════════════════════════════════
// РУЛЕТКА (реальная)
// ══════════════════════════════════════════════════════════
function setPayStatus(msg, cls) {
  var el = document.getElementById("pay-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "pay-status" + (cls ? " " + cls : "");
}

function confetti() {
  var colors = ["#ffffff","#A8FF78","#5dbcff","#FF5E5B","#B388FF","#cfcfcf"];
  for (var i = 0; i < 50; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement("div");
        p.className = "confetti-p";
        var fromRight = idx >= 25;
        var color = colors[Math.floor(Math.random() * colors.length)];
        var w = 7 + Math.random() * 8;
        var h = 10 + Math.random() * 12;
        var dur = 1.4 + Math.random() * 0.8;
        var rot = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
        var xPct = fromRight ? (80 + Math.random() * 20) : (Math.random() * 20);
        var vx = fromRight ? -(30 + Math.random() * 80) : (30 + Math.random() * 80);
        p.style.cssText = [
          "width:"+w+"px","height:"+h+"px",
          "background:"+color,"left:"+xPct+"%",
          "--cx:"+vx+"px","--cr:"+rot+"deg",
          "animation-duration:"+dur+"s"
        ].join(";");
        document.body.appendChild(p);
        setTimeout(function() { p.remove(); }, (dur + 0.2) * 1000);
      }, idx * 30);
    })(i);
  }
}

function onSpinClick() {
  if (demoMode) { onDemoSpin(); return; }
  if (!TG_ID) { toast("Открой через Telegram Mini App"); return; }
  var btn = document.getElementById("spin-btn");
  if (btn) btn.disabled = true;
  haptic("medium");

  api("/create-bet", { tg_id: TG_ID, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = res.bet_id;
      var acEl  = document.getElementById("ring-account");
      var alEl  = document.getElementById("ring-account-link");
      var bidEl = document.getElementById("pay-bet-id");
      if (acEl)  acEl.textContent  = res.ring_account || "@kinub";
      if (alEl)  alEl.textContent  = res.ring_account || "@kinub";
      if (bidEl) bidEl.textContent = res.bet_id;
      setPayStatus("", "");
      payCheckAttempts = 0;
      if (res.bet_status === "paid") { showSpinAnimation(); return; }
      showScreen("screen-pay");
      if (btn) btn.disabled = false;
      startAutoPayCheck();
    })
    .catch(function(e) {
      if (btn) btn.disabled = false;
      toast("Ошибка: " + (e.message || "попробуй снова"));
    });
}

function startAutoPayCheck() {
  stopPayCheck();
  payCheckTimer = setInterval(function() {
    if (payCheckAttempts >= PAY_MAX_ATTEMPTS) {
      stopPayCheck();
      setPayStatus("Время ожидания истекло. Создай новую ставку.", "err");
      return;
    }
    checkPaymentSilent();
  }, 5000);
}

function stopPayCheck() {
  if (payCheckTimer) { clearInterval(payCheckTimer); payCheckTimer = null; }
}

function checkPaymentSilent() {
  payCheckAttempts++;
  if (!currentBetId) return;
  api("/check-payment", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      if (res.confirmed) {
        stopPayCheck();
        haptic("heavy");
        setPayStatus("✅ Кольца получены! Запускаем рулетку...", "ok");
        setTimeout(function() { showSpinAnimation(); }, 600);
      } else {
        setPayStatus("Ждём кольца... (" + (res.rings_found || 0) + "/2 получено)", "wait");
      }
    }).catch(function() { setPayStatus("Проверяем...", "wait"); });
}

function onCheckPayment() {
  var btn = document.getElementById("pay-confirm-btn");
  if (btn) btn.disabled = true;
  setPayStatus("Проверяем подарки...", "wait");
  haptic("light");
  if (!currentBetId) {
    setPayStatus("Ошибка: нет активной ставки.", "err");
    if (btn) btn.disabled = false;
    return;
  }
  api("/check-payment", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      if (btn) btn.disabled = false;
      if (res.confirmed) {
        stopPayCheck();
        setPayStatus("✅ Кольца получены!", "ok");
        setTimeout(function() { showSpinAnimation(); }, 800);
      } else {
        setPayStatus("Кольца не найдены (" + (res.rings_found || 0) + "/2). " + (res.reason || "Попробуй чуть позже."), "err");
      }
    }).catch(function(e) {
      if (btn) btn.disabled = false;
      setPayStatus("Ошибка: " + (e.message || "попробуй снова"), "err");
    });
}

function showSpinAnimation() {
  haptic("heavy");
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s && sid !== "screen-spin") { s.style.display = "none"; s.classList.remove("active"); }
  });
  var spinEl = document.getElementById("screen-spin");
  if (spinEl) { spinEl.style.display = "flex"; spinEl.classList.add("active"); }
  currentTab = "spin";

  var btnWrap = document.getElementById("spin-btn-wrap");
  if (btnWrap) btnWrap.style.opacity = "0";

  if (!currentBetId) {
    showError("Ошибка", "Нет активной ставки.", function() { switchTab("spin"); });
    return;
  }

  api("/spin", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = null;
      var isWin = res.result === "win";
      // withStarItem = true → в барабане остановится звёздочка (приз звёзды)
      // withStarItem = false → в барабане остановится TGS (NFT или проигрыш)
      var withStarItem = isWin && res.prize_type === "stars";
      startSpinAnimation(function() {
        if (btnWrap) btnWrap.style.opacity = "";
        showResult(res);
      }, withStarItem);
    })
    .catch(function(e) {
      if (btnWrap) btnWrap.style.opacity = "";
      showError("Ошибка спина", (e && e.message) || "Обратись в поддержку.", function() { switchTab("spin"); });
    });
}

// ══════════════════════════════════════════════════════════
// ПОКАЗ РЕЗУЛЬТАТА
// Если win → показываем видео НФТ (соответственно nft_stars)
// Если lose → показываем звёзды (1–4)
// ══════════════════════════════════════════════════════════
function showResult(res) {
  if (res.result === "win" && res.prize_type === "nft") {
    haptic("heavy");
    confetti();
    // Определяем видео по nft_stars
    var nftStars = res.nft_stars || 300;
    var nftGift  = getRandomNftGift(nftStars);

    // Показываем видео NFT на 3 сек, затем экран результата
    showNftVideoOverlay({ name: res.nft_name || nftGift.name, src: nftGift.src }, false, function() {
      _showWinResultScreen(res);
    });

  } else if (res.result === "win" && res.prize_type === "stars") {
    haptic("heavy");
    confetti();
    var starCount = res.stars_prize_amount || 50;
    showStarsEffect(starCount, function() {
      _showStarsWinResultScreen(res);
    });

  } else {
    // Проигрыш — показать звёзды (1–4)
    var starCount = 1 + Math.floor(Math.random() * 5);
    showStarsEffect(starCount, function() {
      _showLoseResultScreen(res);
    });
  }
}

function _showWinResultScreen(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { switchTab("spin"); return; }

  var availableDate = "";
  if (res.available_at) {
    availableDate = new Date(res.available_at).toLocaleDateString("ru-RU");
  }
  wrap.innerHTML =
    '<div class="result-icon">🎉</div>' +
    '<div class="result-title win">Ты выиграл!</div>' +
    '<div class="result-nft">' +
      '<div class="result-nft-name">' + (res.nft_name || "NFT подарок") + '</div>' +
      '<div class="result-nft-info">' + (res.nft_stars ? res.nft_stars + "⭐" : "") + (availableDate ? " · выдача " + availableDate : "") + '</div>' +
    '</div>' +
    '<div class="result-sub">🕐 NFT будет отправлен через 21 день после покупки.<br>Он уже в твоём инвентаре!</div>' +
    '<button class="result-btn" onclick="switchTab(\'spin\')">Крутить ещё</button>';
  showScreen("screen-result");
}

function _showLoseResultScreen(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { switchTab("spin"); return; }

  var nextWinText = res.next_win_in ? "До выигрыша: " + res.next_win_in + " ставки" : "";
  wrap.innerHTML =
    '<div class="result-icon">⭐</div>' +
    '<div class="result-title" style="color:#ffffff">Звёздный день!</div>' +
    '<div class="result-sub">Попробуй ещё раз!<br>' + (nextWinText ? '<b>' + nextWinText + '</b>' : '') + '</div>' +
    '<button class="result-btn" onclick="switchTab(\'spin\')">Попробовать снова</button>';
  showScreen("screen-result");
}

function _showStarsWinResultScreen(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { switchTab("spin"); return; }

  var amount = res.stars_prize_amount || 50;
  wrap.innerHTML =
    '<div class="result-icon">⭐</div>' +
    '<div class="result-title win">Ты выиграл звёзды!</div>' +
    '<div class="result-nft">' +
      '<div class="result-nft-name">' + amount + ' ⭐</div>' +
      '<div class="result-nft-info">Начислено на твой баланс</div>' +
    '</div>' +
    '<div class="result-sub">🌟 Звёзды уже у тебя на балансе.<br>Крути ещё — впереди NFT!</div>' +
    '<button class="result-btn" onclick="switchTab(\'spin\')">Крутить ещё</button>';
  showScreen("screen-result");
}

// ══════════════════════════════════════════════════════════
// РЕФЕРАЛЬНАЯ СИСТЕМА
// Правильный формат: https://t.me/BOT?start=ref_TGID
// ══════════════════════════════════════════════════════════
var BOT_USERNAME = "leonardo_game_bot";
var APP_NAME     = "app";

function getRefLink() {
  // Формат для Telegram Mini Apps: https://t.me/BOT/APP?startapp=ref_ID
  // Это открывает Mini App с параметром start_param = "ref_TGID"
  return "https://t.me/" + BOT_USERNAME + "/" + APP_NAME + "?startapp=ref_" + TG_ID;
}

function loadReferral() {
  var refLink = getRefLink();
  var linkBox = document.getElementById("ref-link-box");
  if (linkBox) {
    linkBox.textContent = refLink;
    linkBox.style.cssText = "word-break:break-all;font-size:12px;color:#5dbcff;cursor:pointer;user-select:all;";
    linkBox.onclick = function() { copyRefLink(); };
  }

  if (!TG_ID) return;
  api("/referral/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(res) {
      var cntEl = document.getElementById("ref-count");
      var ernEl = document.getElementById("ref-earned");
      if (cntEl) cntEl.textContent = res.referral_count || 0;
      if (ernEl) ernEl.textContent = (res.referral_count || 0) + " ⭐";
    }).catch(function() {});
}

function copyRefLink() {
  var refLink = getRefLink();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(refLink).then(function() {
      toast("Ссылка скопирована! 🔗");
      haptic("light");
    }).catch(function() {
      _fallbackCopy(refLink);
    });
  } else {
    _fallbackCopy(refLink);
  }
}

function _fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand("copy"); toast("Ссылка скопирована! 🔗"); haptic("light"); }
  catch(e) { toast("Скопируй ссылку вручную"); }
  document.body.removeChild(ta);
}

function shareRefLink() {
  var refLink = getRefLink();
  var shareText = "🎰 Играй в LEONARDO GAME — выигрывай NFT-подарки Telegram!";
  if (tg && tg.openTelegramLink) {
    var shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(refLink) + "&text=" + encodeURIComponent(shareText);
    tg.openTelegramLink(shareUrl);
  } else if (navigator.share) {
    navigator.share({ title: "LEONARDO GAME", text: shareText, url: refLink }).catch(function() { copyRefLink(); });
  } else {
    copyRefLink();
  }
  haptic("medium");
}

// ══════════════════════════════════════════════════════════
// ТОПЫ ИГРОКОВ
// ══════════════════════════════════════════════════════════
var lbData = [];
var lbPage = 0;
var LB_PAGE_SIZE = 10;

function loadLeaderboard() {
  var podium = document.getElementById("lb-podium");
  var list   = document.getElementById("lb-rest-list");
  if (podium) podium.innerHTML = "<div class='lb-loading'>Загрузка...</div>";
  if (list)   list.innerHTML = "";

  api("/leaderboard?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(res) {
      lbData = res.players || [];
      lbPage = 0;
      renderPodium(lbData.slice(0, 3));
      renderLbPage();
    }).catch(function() {
      if (podium) podium.innerHTML = "<div class='lb-loading'>Ошибка загрузки</div>";
    });
}

function renderPodium(top3) {
  var podium = document.getElementById("lb-podium");
  if (!podium) return;
  if (!top3 || top3.length === 0) { podium.innerHTML = ""; return; }

  var medals = ["🥇", "🥈", "🥉"];
  var p1 = top3[0] || null;
  var p2 = top3[1] || null;
  var p3 = top3[2] || null;

  function avatarHtml(p, size) {
    var sz = size || 44;
    if (p && p.photo_url) {
      return "<img src='" + p.photo_url + "' class='lb-avatar-img' style='width:" + sz + "px;height:" + sz + "px;border-radius:50%;object-fit:cover;display:block;' onerror=\"this.style.display='none';this.nextSibling.style.display='flex';\"/>" +
              "<span class='lb-avatar-fallback' style='display:none;width:" + sz + "px;height:" + sz + "px;'>" + initials(p) + "</span>";
    }
    return "<span class='lb-avatar-fallback' style='width:" + sz + "px;height:" + sz + "px;'>" + initials(p) + "</span>";
  }

  function podCard(p, rank, highlight) {
    if (!p) return "<div class='lb-pod-card lb-pod-empty'></div>";
    return "<div class='lb-pod-card" + (highlight ? " lb-pod-first" : "") + "'>" +
      "<div class='lb-pod-medal'>" + medals[rank] + "</div>" +
      "<div class='lb-pod-av-wrap'>" + avatarHtml(p, highlight ? 52 : 44) + "</div>" +
      "<div class='lb-pod-name'>@" + (p.username || "игрок") + "</div>" +
      "<div class='lb-pod-score'>" + (p.total_spins || 0) + " ставок</div>" +
      "</div>";
  }

  podium.innerHTML =
    "<div class='lb-podium-row'>" +
      "<div class='lb-pod-side'>" + podCard(p2, 1, false) + "</div>" +
      "<div class='lb-pod-center'>" + podCard(p1, 0, true) + "</div>" +
      "<div class='lb-pod-side'>" + podCard(p3, 2, false) + "</div>" +
    "</div>";
}

function initials(p) {
  if (!p) return "👤";
  var name = p.first_name || p.username || "";
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

function renderLbPage() {
  var list = document.getElementById("lb-rest-list");
  var pageInfo = document.getElementById("lb-page-info");
  if (!list) return;

  var rest = lbData.slice(3);
  var totalPages = Math.max(1, Math.ceil(rest.length / LB_PAGE_SIZE));
  if (lbPage >= totalPages) lbPage = totalPages - 1;
  if (lbPage < 0) lbPage = 0;

  var start = lbPage * LB_PAGE_SIZE;
  var page  = rest.slice(start, start + LB_PAGE_SIZE);

  if (page.length === 0) {
    list.innerHTML = "<div class='lb-empty'>Список пуст</div>";
  } else {
    list.innerHTML = page.map(function(p, idx) {
      var rank = 4 + start + idx;
      var isMe = (p.tg_id === TG_ID);
      var avHtml;
      if (p.photo_url) {
        avHtml = "<img src='" + p.photo_url + "' class='lb-row-av-img' onerror=\"this.style.display='none';this.nextSibling.style.display='flex';\"/>" +
                 "<span class='lb-row-av-fb' style='display:none;'>" + initials(p) + "</span>";
      } else {
        avHtml = "<span class='lb-row-av-fb'>" + initials(p) + "</span>";
      }
      return "<div class='lb-row" + (isMe ? " lb-row-me" : "") + "'>" +
        "<div class='lb-row-rank'>" + rank + "</div>" +
        "<div class='lb-row-avatar'>" + avHtml + "</div>" +
        "<div class='lb-row-name'>" + (p.first_name ? p.first_name + (p.username ? " <span class='lb-un'>@" + p.username + "</span>" : "") : "@" + (p.username || "игрок")) + "</div>" +
        "<div class='lb-row-score'>" + (p.total_spins || 0) + " ст.</div>" +
        "</div>";
    }).join("");
  }

  if (pageInfo) pageInfo.textContent = (lbPage + 1) + " / " + totalPages;
  var prev = document.getElementById("lb-prev");
  var next = document.getElementById("lb-next");
  if (prev) prev.disabled = lbPage === 0;
  if (next) next.disabled = lbPage >= totalPages - 1;
}

function lbPrev() { if (lbPage > 0) { lbPage--; renderLbPage(); haptic("light"); } }
function lbNext() {
  var rest = lbData.slice(3);
  var totalPages = Math.ceil(rest.length / LB_PAGE_SIZE);
  if (lbPage < totalPages - 1) { lbPage++; renderLbPage(); haptic("light"); }
}

// ══════════════════════════════════════════════════════════
// КНОПКИ
// ══════════════════════════════════════════════════════════
function bindButtons() {
  var spinBtn = document.getElementById("spin-btn");
  if (spinBtn) spinBtn.onclick = function() { onSpinClick(); };

  var confirmBtn = document.getElementById("pay-confirm-btn");
  if (confirmBtn) confirmBtn.onclick = function() { onCheckPayment(); };

  var backBtn = document.getElementById("pay-back-btn");
  if (backBtn) backBtn.onclick = function() {
    stopPayCheck();
    currentBetId = null;
    var spinWrap = document.getElementById("spin-btn-wrap");
    if (spinWrap) spinWrap.style.marginTop = "";
    ALL_SCREENS.forEach(function(sid) {
      var s = document.getElementById(sid);
      if (s) { s.style.display = "none"; s.classList.remove("active"); }
    });
    var spinEl = document.getElementById("screen-spin");
    if (spinEl) { spinEl.style.display = "flex"; spinEl.classList.add("active"); }
    currentTab = "spin";
    document.querySelectorAll(".nav-tab").forEach(function(btn) {
      btn.classList.remove("active");
      if (btn.getAttribute("data-tab") === "spin") btn.classList.add("active");
    });
    var spinBtnEl = document.getElementById("spin-btn");
    if (spinBtnEl) spinBtnEl.disabled = false;
    setTimeout(forcePlayAllVideos, 100);
  };

  var errBtn = document.getElementById("error-btn");
  if (errBtn) errBtn.onclick = function() { switchTab("spin"); };

  var toggle = document.getElementById("toggle-notif");
  if (toggle) {
    var notifOn = localStorage.getItem("notif") === "1";
    if (notifOn) toggle.classList.add("on");
    toggle.onclick = function() {
      toggle.classList.toggle("on");
      localStorage.setItem("notif", toggle.classList.contains("on") ? "1" : "0");
      haptic("light");
    };
  }
}

// ══════════════════════════════════════════════════════════
// СТАРТ
// ══════════════════════════════════════════════════════════
function showHomeScreen() {
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s) { s.style.display = "none"; s.classList.remove("active"); }
  });
  var homeEl = document.getElementById("screen-home");
  if (homeEl) { homeEl.style.display = "flex"; homeEl.classList.add("active"); }
  currentTab = "home";
  bindButtons();
  requestAnimationFrame(loadTgsAnimations);

  // Показываем кнопку Админ по локальному fallback сразу
  document.querySelectorAll(".nav-tab-admin").forEach(function(btn) {
    btn.style.display = isAdminUser ? "" : "none";
  });

  // Затем уточняем is_admin с бэкенда (учитывает ADMIN_TG_ID из env)
  if (TG_ID) {
    api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
      .then(function(s) {
        if (typeof s.is_admin === "boolean" && s.is_admin !== isAdminUser) {
          isAdminUser = s.is_admin;
          document.querySelectorAll(".nav-tab-admin").forEach(function(btn) {
            btn.style.display = isAdminUser ? "" : "none";
          });
        }
      }).catch(function() {});
  }
}

function startApp() {
  preloadTgsFiles();
  var loadEl = document.getElementById("load-status");
  if (loadEl) loadEl.textContent = "Загрузка...";

  var referrerId = null;
  var isRefVisit = false;
  try {
    var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param)
      ? tg.initDataUnsafe.start_param : "";
    if (!startParam) {
      var urlParams = new URLSearchParams(window.location.search);
      startParam = urlParams.get("startapp") || urlParams.get("start") || "";
    }
    // Поддерживаем оба формата: ref_12345 и inviteCode12345
    var refRaw = null;
    if (startParam) {
      if (startParam.startsWith("ref_")) { refRaw = startParam.substring(4); }
      else if (startParam.startsWith("inviteCode")) { refRaw = startParam.substring(10); }
    }
    if (refRaw) {
      var parsed = parseInt(refRaw, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed !== TG_ID) {
        referrerId = parsed;
        isRefVisit = true;
      }
    }
  } catch(e) {}

  if (!TG_ID) {
    showHomeScreen();
    return;
  }

  var appShown = false;
  function finishInit(alreadyReg) {
    if (appShown) return;
    appShown = true;
    showHomeScreen();
    if (isRefVisit && !alreadyReg) {
      setTimeout(function() {
        toast("⭐ Ты пришёл по реферальной ссылке — твой друг получил звезду!");
      }, 800);
    }
  }

  var loadTimeout = setTimeout(function() { finishInit(false); }, 1200);

  var regBody = { tg_id: TG_ID, username: TG_NAME, first_name: TG_FIRST, init_data: INIT_DATA };
  if (referrerId) regBody.referrer_id = referrerId;

  api("/register", regBody)
    .then(function(res) {
      clearTimeout(loadTimeout);
      finishInit(res.already_registered);
    })
    .catch(function() {
      clearTimeout(loadTimeout);
      finishInit(false);
    });
}

// ══════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════
window.addEventListener("load", function() {
  startApp();
  // Single deferred play attempt after DOM settles
  setTimeout(forcePlayAllVideos, 200);
});

// ══════════════════════════════════════════════════════════
// PRELOAD TGS FILES
// ══════════════════════════════════════════════════════════
var PRELOADED_TGS = {};

function preloadTgsFiles() {
  // Приоритет 1 — файлы которые видны сразу (карусель на главной)
  var priority1 = [
    "photos/ring.tgs", "photos/bear.tgs", "photos/icecream.tgs",
    "photos/lighting.tgs", "photos/year.tgs", "photos/rocket.tgs"
  ];
  // Приоритет 2 — остальные подарки рулетки
  var priority2 = [
    "photos/socks.tgs", "photos/skull.tgs", "photos/koldun.tgs",
    "photos/lolipop.tgs", "photos/heart.tgs", "photos/eye.tgs",
    "photos/cat.tgs", "photos/button.tgs", "photos/snake.tgs",
    "photos/crystal.tgs", "photos/sigara.tgs"
  ];
  // Приоритет 3 — иконки меню (грузим последними)
  var priority3 = [
    "photos2/dep.tgs", "photos2/inv.tgs", "photos2/ref.tgs", "photos2/top.tgs"
  ];

  function fetchAndCache(src) {
    if (_tgsCache[src]) return Promise.resolve();
    return fetch(src)
      .then(function(r) { if (!r.ok) return; return r.arrayBuffer(); })
      .then(function(buf) {
        if (!buf) return;
        var uint8 = new Uint8Array(buf);
        var json;
        try {
          var d = pako.inflate(uint8);
          json = JSON.parse(new TextDecoder("utf-8").decode(d));
        } catch(e) {
          try { json = JSON.parse(new TextDecoder("utf-8").decode(uint8)); }
          catch(e2) { return; }
        }
        _tgsCache[src] = json;
      })
      .catch(function() {});
  }

  // Батч-загрузка: не более 3 одновременных fetch
  function loadBatch(files, onDone) {
    var idx = 0;
    var running = 0;
    var BATCH = 3;
    function next() {
      while (running < BATCH && idx < files.length) {
        running++;
        var src = files[idx++];
        fetchAndCache(src).then(function() { running--; next(); });
      }
      if (running === 0 && idx >= files.length && onDone) onDone();
    }
    next();
  }

  // Грузим последовательно: сначала P1, потом P2, потом P3
  loadBatch(priority1, function() {
    loadBatch(priority2, function() {
      loadBatch(priority3, null);
    });
  });
}

// ══════════════════════════════════════════════════════════
// TGS ЗАГРУЗЧИК
// ══════════════════════════════════════════════════════════
// ── TGS cache: url → parsed JSON (avoid re-fetch + re-parse) ──
var _tgsCache = {};
// Loading queue to stagger heavy Lottie init (avoid blocking main thread)
var _tgsQueue   = [];
var _tgsRunning = 0;
var _TGS_CONCURRENCY = 4; // max simultaneous inits

// ── Visibility-based play/pause ──────────────────────────────
// На экране рулетки и в оверлее прокрутки одновременно существует
// 30-70+ Lottie-анимаций, но видно из них реально 2-3 (остальные
// скрыты маской/уехали за экран). Раньше ВСЕ они анимировались
// каждый кадр — отсюда жуткие лаги карусели и самой прокрутки.
// Теперь: анимация играет только пока её контейнер реально виден
// в области экрана, остальные — на паузе (без какого-либо урона
// для внешнего вида, просто не тратим CPU/GPU вхолостую).
var _lottieAnims = new WeakMap(); // container -> lottie instance
var _tgsVisibilityObserver = ('IntersectionObserver' in window)
  ? new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var anim = _lottieAnims.get(entry.target);
        if (!anim) return;
        if (entry.isIntersecting) {
          if (anim.isPaused) anim.play();
        } else {
          if (!anim.isPaused) anim.pause();
        }
      });
    }, { threshold: 0, rootMargin: "0px -15% 0px -15%" })
  : null;

function _tgsProcessQueue() {
  while (_tgsRunning < _TGS_CONCURRENCY && _tgsQueue.length > 0) {
    var job = _tgsQueue.shift();
    _tgsRunning++;
    _tgsInitContainer(job.container, job.src, job.json);
  }
}

function _tgsInitContainer(container, src, json) {
  container.innerHTML = '';
  var anim = lottie.loadAnimation({
    container: container,
    renderer: 'svg',
    loop: true,
    autoplay: true,
    animationData: json,
    rendererSettings: {
      progressiveLoad: true,
      hideOnTransparent: true,
      viewBoxOnly: true
    }
  });
  // дешевле интерполировать кадры — заметно снижает нагрузку
  // при большом числе одновременных анимаций
  try { anim.setSubframe(false); } catch(e) {}

  _lottieAnims.set(container, anim);
  if (_tgsVisibilityObserver) _tgsVisibilityObserver.observe(container);

  // single resize after first frame
  anim.addEventListener('enterFrame', function onFirst() {
    anim.removeEventListener('enterFrame', onFirst);
    try { anim.resize(); } catch(e) {}
    _tgsRunning--;
    _tgsProcessQueue();
  });
}

// Полная остановка и освобождение анимаций внутри узла —
// используется когда блок с tgs-контейнерами удаляется из DOM
// (например, оверлей прокрутки), чтобы не копился мусор и
// фоновые обновления от уже невидимых анимаций.
function _tgsCleanupScope(rootEl) {
  if (!rootEl) return;
  var nodes = rootEl.querySelectorAll ? rootEl.querySelectorAll('.tgs-container') : [];
  nodes.forEach(function(c) {
    var anim = _lottieAnims.get(c);
    if (anim) {
      try { anim.destroy(); } catch(e) {}
      _lottieAnims.delete(c);
    }
    if (_tgsVisibilityObserver) _tgsVisibilityObserver.unobserve(c);
  });
}

function loadTgsAnimations() {
  var containers = document.querySelectorAll('.tgs-container[data-tgs]');

  // Разбиваем на видимые (в viewport) и скрытые — видимые грузим первыми
  var visible = [], hidden = [];
  containers.forEach(function(c) {
    if (c._tgsLoaded) return;
    var rect = c.getBoundingClientRect();
    var inView = rect.bottom > 0 && rect.top < window.innerHeight &&
                 rect.right > 0 && rect.left < window.innerWidth;
    (inView ? visible : hidden).push(c);
  });

  function enqueue(container) {
    var src = container.getAttribute('data-tgs');
    if (!src || container._tgsLoaded) return;
    container._tgsLoaded = true;

    if (_tgsCache[src]) {
      _tgsQueue.push({ container: container, src: src, json: _tgsCache[src] });
      _tgsProcessQueue();
      return;
    }

    fetch(src)
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.arrayBuffer();
      })
      .then(function(buf) {
        var uint8 = new Uint8Array(buf);
        var json;
        try {
          var decompressed = pako.inflate(uint8);
          json = JSON.parse(new TextDecoder('utf-8').decode(decompressed));
        } catch(e) {
          try {
            json = JSON.parse(new TextDecoder('utf-8').decode(uint8));
          } catch(e2) {
            container._tgsLoaded = false;
            return;
          }
        }
        _tgsCache[src] = json;
        _tgsQueue.push({ container: container, src: src, json: json });
        _tgsProcessQueue();
      })
      .catch(function() {
        container._tgsLoaded = false;
      });
  }

  // Сначала видимые — без задержки
  visible.forEach(function(c) { enqueue(c); });

  // Скрытые — с задержкой, чтобы не конкурировать с видимыми
  if (hidden.length > 0) {
    setTimeout(function() {
      hidden.forEach(function(c) { enqueue(c); });
    }, 800);
  }
}

// ══════════════════════════════════════════════════════════
// АМБИЕНТНЫЕ ЧАСТИЦЫ НА ЭКРАНЕ РУЛЕТКИ
// ══════════════════════════════════════════════════════════
(function() {
  var PARTICLE_COUNT_DESKTOP = 22;
  var PARTICLE_COUNT_MOBILE  = 12;

  function rand(min, max) { return min + Math.random() * (max - min); }

  // Точка стартует у одного из краёв экрана и дрейфует к другому краю/углу
  function edgePoint() {
    var side = Math.floor(rand(0, 4)); // 0:top 1:right 2:bottom 3:left
    var pos = rand(0, 100);
    switch (side) {
      case 0: return { x: pos, y: rand(-2, 6) };
      case 1: return { x: rand(94, 102), y: pos };
      case 2: return { x: pos, y: rand(94, 102) };
      default: return { x: rand(-2, 6), y: pos };
    }
  }

  function buildParticles() {
    var container = document.getElementById('spin-particles');
    if (!container || container._built) return;
    container._built = true;

    var isSmall = window.matchMedia('(max-width: 600px)').matches;
    var count = isSmall ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP;
    var frag = document.createDocumentFragment();

    for (var i = 0; i < count; i++) {
      var el = document.createElement('div');
      el.className = 'spin-particle';

      var p1 = edgePoint();
      var p2 = edgePoint();

      el.style.setProperty('--px', p1.x + '%');
      el.style.setProperty('--py', p1.y + '%');
      el.style.setProperty('--pdx', (p2.x - p1.x) + 'vw');
      el.style.setProperty('--pdy', (p2.y - p1.y) + 'vh');

      var p3 = edgePoint();
      el.style.setProperty('--pdx2', (p3.x - p1.x) + 'vw');
      el.style.setProperty('--pdy2', (p3.y - p1.y) + 'vh');

      el.style.setProperty('--ps', rand(1.5, 3) + 'px');
      el.style.setProperty('--pop', rand(0.25, 0.55).toFixed(2));
      el.style.setProperty('--pdur', rand(10, 22).toFixed(1) + 's');
      el.style.setProperty('--pdelay', (-rand(0, 20)).toFixed(1) + 's');

      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    buildParticles();
  } else {
    document.addEventListener('DOMContentLoaded', buildParticles);
  }
  // Подстраховка, если контейнер появляется позже
  window.addEventListener('load', buildParticles);
})();

// ══════════════════════════════════════════════════════════
// ADMIN PANEL
// ══════════════════════════════════════════════════════════

function adminApi(path, params) {
  var url = API_URL + path;
  var sep = path.indexOf('?') === -1 ? '?' : '&';
  url += sep + 'tg_id=' + TG_ID + '&init_data=' + encodeURIComponent(INIT_DATA);
  if (params) {
    Object.keys(params).forEach(function(k) {
      url += '&' + k + '=' + encodeURIComponent(params[k]);
    });
  }
  return fetch(url).then(function(r) { return r.json(); });
}

function adminPost(path, body) {
  body.tg_id = TG_ID;
  body.init_data = INIT_DATA;
  return fetch(API_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); });
}

var adminSection = 'dashboard';

function loadAdminPanel() {
  if (!isAdminUser) { switchTab('home'); return; }
  renderAdminNav();
  loadAdminSection(adminSection);
}

function renderAdminNav() {
  var nav = document.getElementById('admin-section-nav');
  if (!nav) return;
  var sections = [
    { id: 'dashboard', label: '📊 Дашборд' },
    { id: 'users',     label: '👥 Юзеры' },
    { id: 'bets',      label: '🎰 Ставки' },
    { id: 'inventory', label: '📦 Инвентарь' },
    { id: 'settings',  label: '⚙️ Настройки' },
    { id: 'audit',     label: '📋 Аудит' },
  ];
  nav.innerHTML = sections.map(function(s) {
    return '<button class="admin-nav-btn' + (adminSection === s.id ? ' active' : '') +
      '" onclick="switchAdminSection(\'' + s.id + '\')">' + s.label + '</button>';
  }).join('');
}

function switchAdminSection(sec) {
  adminSection = sec;
  renderAdminNav();
  loadAdminSection(sec);
}

function loadAdminSection(sec) {
  var body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = '<div class="admin-loading">Загрузка...</div>';
  if (sec === 'dashboard') loadAdminDashboard(body);
  else if (sec === 'users') loadAdminUsers(body);
  else if (sec === 'bets') loadAdminBets(body);
  else if (sec === 'inventory') loadAdminInventory(body);
  else if (sec === 'settings') loadAdminSettings(body);
  else if (sec === 'audit') loadAdminAudit(body);
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch(e) { return iso.substring(0,16).replace('T',' '); }
}

// ── DASHBOARD ─────────────────────────────────────────────
function loadAdminDashboard(body) {
  Promise.all([
    adminApi('/admin/dashboard'),
    adminApi('/admin/userbot/balance'),
  ]).then(function(results) {
    var d = results[0];
    var bal = results[1];
    if (!d || d.status !== 'ok') { body.innerHTML = '<div class="admin-err">Ошибка загрузки</div>'; return; }
    var w = d.last_7_days || {}; var t = d.totals || {};
    body.innerHTML =
      '<div class="admin-cards">' +
        '<div class="admin-card"><div class="admin-card-val">' + (t.total_users||0) + '</div><div class="admin-card-lbl">Всего юзеров</div></div>' +
        '<div class="admin-card"><div class="admin-card-val">' + (t.pending_nft||0) + '</div><div class="admin-card-lbl">NFT к выдаче</div></div>' +
        '<div class="admin-card"><div class="admin-card-val">' + (w.new_users||0) + '</div><div class="admin-card-lbl">Новых за 7д</div></div>' +
        '<div class="admin-card"><div class="admin-card-val">' + (w.new_bets||0) + '</div><div class="admin-card-lbl">Ставок за 7д</div></div>' +
        '<div class="admin-card"><div class="admin-card-val">' + (w.new_wins||0) + '</div><div class="admin-card-lbl">Выигрышей 7д</div></div>' +
        '<div class="admin-card"><div class="admin-card-val">' + (bal && bal.balance !== null && bal.balance !== undefined ? bal.balance + '⭐' : '—') + '</div><div class="admin-card-lbl">Баланс юзербота</div></div>' +
      '</div>' +
      '<div class="admin-info-row">🎁 Аккаунт получения: <b>' + (d.gift_account||'—') + '</b></div>' +
      '<div class="admin-actions">' +
        '<button class="admin-btn" onclick="adminRunCron()">▶️ Запустить cron вручную</button>' +
      '</div>' +
      '<div id="admin-cron-result" style="margin-top:10px;font-size:13px;color:#A8FF78;text-align:center;"></div>';
  }).catch(function() {
    body.innerHTML = '<div class="admin-err">Нет соединения с сервером</div>';
  });
}

function adminRunCron() {
  adminPost('/admin/cron/run', {}).then(function(r) {
    var el = document.getElementById('admin-cron-result');
    if (el) el.textContent = r.message || (r.status === 'ok' ? 'Cron запущен!' : 'Ошибка');
  });
}

// ── USERS ──────────────────────────────────────────────────
var adminUsersPage = 0;
var adminUsersSearch = '';

function loadAdminUsers(body, search, page) {
  search = search !== undefined ? search : adminUsersSearch;
  page = page !== undefined ? page : adminUsersPage;
  adminUsersSearch = search; adminUsersPage = page;

  var searchHtml =
    '<div class="admin-search-row">' +
      '<input id="admin-user-search" class="admin-input" placeholder="Поиск по tg_id или @username" value="' + search + '">' +
      '<button class="admin-btn" onclick="adminDoUserSearch()">Найти</button>' +
      '<button class="admin-btn admin-btn-sec" onclick="loadAdminUsers(document.getElementById(\'admin-body\'),\'\',0)">Сброс</button>' +
    '</div>';

  body.innerHTML = searchHtml + '<div class="admin-loading">Загрузка...</div>';

  var promise = search
    ? adminApi('/admin/user/search', { q: search })
    : adminApi('/admin/users', { limit: 30, offset: page * 30 });

  promise.then(function(r) {
    var users = r.users || r.data || [];
    var html = searchHtml;
    if (!users.length) { body.innerHTML = html + '<div class="admin-empty">Пользователи не найдены</div>'; return; }
    html += '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>TG ID</th><th>Username</th><th>Имя</th><th>Цикл</th><th>⭐</th><th>Бан</th><th>Действия</th></tr></thead><tbody>';
    users.forEach(function(u) {
      html += '<tr>' +
        '<td>' + u.tg_id + '</td>' +
        '<td>' + (u.username ? '@'+u.username : '—') + '</td>' +
        '<td>' + (u.first_name || '—') + '</td>' +
        '<td>' + (u.cycle_spin||0) + '/' + (u.winning_spin||3) + '</td>' +
        '<td>' + (u.stars_balance||0) + '</td>' +
        '<td>' + (u.is_banned ? '🚫' : '✅') + '</td>' +
        '<td><button class="admin-btn admin-btn-sm" onclick="adminShowUser(' + u.tg_id + ')">👁</button></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    if (!search) {
      html += '<div class="admin-pagination">' +
        (page > 0 ? '<button class="admin-btn admin-btn-sec" onclick="loadAdminUsers(document.getElementById(\'admin-body\'),\'\','+(page-1)+')">← Назад</button>' : '') +
        '<span style="padding:0 12px;opacity:.6">Стр ' + (page+1) + '</span>' +
        (users.length === 30 ? '<button class="admin-btn admin-btn-sec" onclick="loadAdminUsers(document.getElementById(\'admin-body\'),\'\','+(page+1)+')">Вперёд →</button>' : '') +
      '</div>';
    }
    body.innerHTML = html;
  }).catch(function() {
    body.innerHTML = searchHtml + '<div class="admin-err">Ошибка загрузки</div>';
  });
}

function adminDoUserSearch() {
  var q = (document.getElementById('admin-user-search') || {}).value || '';
  loadAdminUsers(document.getElementById('admin-body'), q.trim(), 0);
}

function adminShowUser(targetId) {
  var body = document.getElementById('admin-body');
  body.innerHTML = '<div class="admin-loading">Загрузка...</div>';
  adminApi('/admin/user/' + targetId).then(function(r) {
    var u = r.user || r;
    var inv = r.inventory || [];
    var bets = r.bets || [];
    var html =
      '<button class="admin-btn admin-btn-sec" style="margin-bottom:12px" onclick="switchAdminSection(\'users\')">← Назад</button>' +
      '<div class="admin-user-card">' +
        '<div class="admin-user-header">' +
          '<div class="admin-user-name">' + (u.first_name||'') + ' ' + (u.username ? '@'+u.username : '') + '</div>' +
          '<div class="admin-user-id">TG ID: <b>' + targetId + '</b></div>' +
        '</div>' +
        '<div class="admin-user-stats">' +
          '<span>Цикл: <b>' + (u.cycle_spin||0) + '/' + (u.winning_spin||3) + '</b></span>' +
          '<span>Всего циклов: <b>' + (u.total_cycles||0) + '</b></span>' +
          '<span>⭐ Баланс: <b>' + (u.stars_balance||0) + '</b></span>' +
          '<span>Рефералов: <b>' + (u.referral_count||0) + '</b></span>' +
          '<span>Статус: <b>' + (u.is_banned ? '🚫 Забанен' : '✅ Активен') + '</b></span>' +
          '<span>Регистрация: <b>' + fmtDate(u.created_at) + '</b></span>' +
        '</div>' +
        '<div class="admin-user-actions">' +
          '<button class="admin-btn" onclick="adminEditUserDialog(' + targetId + ',' + (u.cycle_spin||0) + ',' + (u.winning_spin||3) + ',' + (u.total_cycles||0) + ',' + (u.stars_balance||0) + ')">✏️ Редактировать</button>' +
          (u.is_banned
            ? '<button class="admin-btn admin-btn-green" onclick="adminUnban(' + targetId + ')">✅ Разбанить</button>'
            : '<button class="admin-btn admin-btn-red" onclick="adminBan(' + targetId + ')">🚫 Забанить</button>') +
          '<button class="admin-btn" onclick="adminGiveFreeSpin(' + targetId + ')">🎁 Бесплатный спин</button>' +
          '<button class="admin-btn" onclick="adminResetCycle(' + targetId + ')">🔄 Сбросить цикл</button>' +
          '<button class="admin-btn" onclick="adminMessageDialog(' + targetId + ')">💬 Написать</button>' +
        '</div>' +
      '</div>';
    body.innerHTML = html;
  }).catch(function() {
    body.innerHTML = '<div class="admin-err">Ошибка загрузки пользователя</div>';
  });
}

function adminEditUserDialog(id, cs, ws, tc, sb) {
  var d = document.createElement('div');
  d.className = 'admin-modal-overlay';
  d.innerHTML =
    '<div class="admin-modal">' +
      '<div class="admin-modal-title">Редактировать пользователя #' + id + '</div>' +
      '<label>Cycle spin<input id="ae-cs" class="admin-input" type="number" value="' + cs + '"></label>' +
      '<label>Winning spin<input id="ae-ws" class="admin-input" type="number" value="' + ws + '"></label>' +
      '<label>Total cycles<input id="ae-tc" class="admin-input" type="number" value="' + tc + '"></label>' +
      '<label>Stars balance<input id="ae-sb" class="admin-input" type="number" value="' + sb + '"></label>' +
      '<div class="admin-modal-btns">' +
        '<button class="admin-btn" onclick="adminEditUserSave(' + id + ')">💾 Сохранить</button>' +
        '<button class="admin-btn admin-btn-sec" onclick="this.closest(\'.admin-modal-overlay\').remove()">Отмена</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
}

function adminEditUserSave(id) {
  var cs = parseInt(document.getElementById('ae-cs').value)||0;
  var ws = parseInt(document.getElementById('ae-ws').value)||3;
  var tc = parseInt(document.getElementById('ae-tc').value)||0;
  var sb = parseInt(document.getElementById('ae-sb').value)||0;
  adminPost('/admin/user/edit', { target_tg_id: id, cycle_spin: cs, winning_spin: ws, total_cycles: tc, stars_balance: sb })
    .then(function(r) {
      document.querySelector('.admin-modal-overlay').remove();
      toast(r.status === 'ok' ? '✅ Сохранено' : '❌ Ошибка: ' + JSON.stringify(r));
      adminShowUser(id);
    });
}

function adminBan(id) {
  var reason = prompt('Причина бана:') || 'admin_ban';
  if (reason === null) return;
  adminPost('/admin/user/ban', { target_tg_id: id, reason: reason })
    .then(function(r) { toast(r.status === 'ok' ? '🚫 Забанен' : '❌ ' + JSON.stringify(r)); adminShowUser(id); });
}

function adminUnban(id) {
  adminPost('/admin/user/unban', { target_tg_id: id })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Разбанен' : '❌ ' + JSON.stringify(r)); adminShowUser(id); });
}

function adminGiveFreeSpin(id) {
  adminPost('/admin/user/free-spin', { target_tg_id: id })
    .then(function(r) { toast(r.status === 'ok' ? '🎁 Спин выдан' : '❌ ' + JSON.stringify(r)); });
}

function adminResetCycle(id) {
  if (!confirm('Сбросить цикл пользователя #' + id + '?')) return;
  adminPost('/admin/user/reset-cycle', { target_tg_id: id })
    .then(function(r) { toast(r.status === 'ok' ? '🔄 Цикл сброшен' : '❌ ' + JSON.stringify(r)); adminShowUser(id); });
}

function adminMessageDialog(id) {
  var d = document.createElement('div');
  d.className = 'admin-modal-overlay';
  d.innerHTML =
    '<div class="admin-modal">' +
      '<div class="admin-modal-title">Написать пользователю #' + id + '</div>' +
      '<textarea id="am-text" class="admin-textarea" placeholder="Текст сообщения (HTML)"></textarea>' +
      '<div class="admin-modal-btns">' +
        '<button class="admin-btn" onclick="adminSendMessage(' + id + ')">📤 Отправить</button>' +
        '<button class="admin-btn admin-btn-sec" onclick="this.closest(\'.admin-modal-overlay\').remove()">Отмена</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
}

function adminSendMessage(id) {
  var text = (document.getElementById('am-text') || {}).value || '';
  if (!text.trim()) return;
  adminPost('/admin/user/message', { target_tg_id: id, text: text })
    .then(function(r) {
      document.querySelector('.admin-modal-overlay').remove();
      toast(r.status === 'ok' ? '✅ Отправлено' : '❌ ' + JSON.stringify(r));
    });
}

// ── BETS ───────────────────────────────────────────────────
function loadAdminBets(body) {
  adminApi('/admin/bets/active').then(function(r) {
    var bets = r.bets || [];
    var html = '<div class="admin-section-title">Активные ставки (' + bets.length + ')</div>';
    if (!bets.length) { body.innerHTML = html + '<div class="admin-empty">Нет активных ставок</div>'; return; }
    html += '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>ID</th><th>TG ID</th><th>Статус</th><th>Создана</th><th>Действия</th></tr></thead><tbody>';
    bets.forEach(function(b) {
      html += '<tr>' +
        '<td>#' + b.id + '</td>' +
        '<td>' + b.tg_id + '</td>' +
        '<td><span class="admin-status admin-status-' + b.status + '">' + b.status + '</span></td>' +
        '<td>' + fmtDate(b.created_at) + '</td>' +
        '<td>' +
          '<button class="admin-btn admin-btn-sm admin-btn-red" onclick="adminCancelBet(' + b.id + ')">✕ Отмена</button> ' +
          '<button class="admin-btn admin-btn-sm" onclick="adminResetBet(' + b.id + ')">↩ Сброс</button>' +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;
  }).catch(function() { body.innerHTML = '<div class="admin-err">Ошибка загрузки</div>'; });
}

function adminCancelBet(id) {
  if (!confirm('Отменить ставку #' + id + '?')) return;
  adminPost('/admin/bet/cancel', { bet_id: id })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Отменена' : '❌ ' + JSON.stringify(r)); loadAdminBets(document.getElementById('admin-body')); });
}

function adminResetBet(id) {
  if (!confirm('Сбросить ставку #' + id + ' (→ waiting_gifts)?')) return;
  adminPost('/admin/bet/reset', { bet_id: id })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Сброшена' : '❌ ' + JSON.stringify(r)); loadAdminBets(document.getElementById('admin-body')); });
}

// ── INVENTORY ──────────────────────────────────────────────
function loadAdminInventory(body) {
  adminApi('/admin/inventory/pending').then(function(r) {
    var items = r.pending || [];
    var html = '<div class="admin-section-title">NFT к выдаче (' + items.length + ')</div>';
    if (!items.length) { body.innerHTML = html + '<div class="admin-empty">Нет ожидающих NFT</div>'; return; }
    html += '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>ID</th><th>TG ID</th><th>NFT</th><th>Статус</th><th>Выдать с</th><th>Действия</th></tr></thead><tbody>';
    items.forEach(function(it) {
      html += '<tr>' +
        '<td>#' + it.id + '</td>' +
        '<td>' + it.tg_id + '</td>' +
        '<td>' + (it.nft_name||'—') + '</td>' +
        '<td><span class="admin-status">' + (it.status||'—') + '</span></td>' +
        '<td>' + fmtDate(it.available_at) + '</td>' +
        '<td>' +
          '<button class="admin-btn admin-btn-sm admin-btn-green" onclick="adminTransferNft(' + it.id + ',' + it.tg_id + ')">📤 Выдать</button> ' +
          '<button class="admin-btn admin-btn-sm" onclick="adminSetInvStatus(' + it.id + ')">✏️</button>' +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;
  }).catch(function() { body.innerHTML = '<div class="admin-err">Ошибка загрузки</div>'; });
}

function adminTransferNft(invId, tgId) {
  if (!confirm('Выдать NFT #' + invId + ' пользователю ' + tgId + '?')) return;
  adminPost('/admin/inventory/transfer', { inventory_id: invId, winner_tg_id: tgId })
    .then(function(r) {
      toast(r.status === 'ok' ? '✅ Передано!' : '❌ ' + (r.detail || JSON.stringify(r)));
      loadAdminInventory(document.getElementById('admin-body'));
    });
}

function adminSetInvStatus(invId) {
  var s = prompt('Новый статус (waiting/sent/manual/error):');
  if (!s) return;
  adminPost('/admin/inventory/status', { inventory_id: invId, new_status: s })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Статус обновлён' : '❌ ' + JSON.stringify(r)); loadAdminInventory(document.getElementById('admin-body')); });
}

// ── SETTINGS ───────────────────────────────────────────────
function loadAdminSettings(body) {
  adminApi('/admin/settings').then(function(r) {
    var settings = r.settings || [];
    var html = '<div class="admin-section-title">Настройки</div>' +
      '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Ключ</th><th>Значение</th><th>Действия</th></tr></thead><tbody>';
    settings.forEach(function(s) {
      html += '<tr>' +
        '<td><b>' + s.key + '</b></td>' +
        '<td><span id="sv-' + s.key + '">' + s.value + '</span></td>' +
        '<td><button class="admin-btn admin-btn-sm" onclick="adminEditSetting(\'' + s.key + '\',\'' + s.value.replace(/'/g,"\\'") + '\')">✏️</button></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="admin-actions" style="margin-top:16px">' +
        '<button class="admin-btn" onclick="adminAddSetting()">➕ Добавить настройку</button>' +
      '</div>';
    body.innerHTML = html;
  }).catch(function() { body.innerHTML = '<div class="admin-err">Ошибка загрузки</div>'; });
}

function adminEditSetting(key, val) {
  var newVal = prompt('Новое значение для "' + key + '":', val);
  if (newVal === null) return;
  adminPost('/admin/settings/set', { key: key, value: newVal })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Сохранено' : '❌ ' + JSON.stringify(r)); loadAdminSettings(document.getElementById('admin-body')); });
}

function adminAddSetting() {
  var key = prompt('Ключ настройки:');
  if (!key) return;
  var val = prompt('Значение:');
  if (val === null) return;
  adminPost('/admin/settings/set', { key: key, value: val })
    .then(function(r) { toast(r.status === 'ok' ? '✅ Добавлено' : '❌ ' + JSON.stringify(r)); loadAdminSettings(document.getElementById('admin-body')); });
}

// ── AUDIT LOG ──────────────────────────────────────────────
var adminAuditPage = 0;
function loadAdminAudit(body, page) {
  page = page !== undefined ? page : adminAuditPage;
  adminAuditPage = page;
  adminApi('/admin/audit-log', { limit: 40, offset: page * 40 }).then(function(r) {
    var log = r.log || [];
    var html = '<div class="admin-section-title">Аудит лог</div>';
    if (!log.length) { body.innerHTML = html + '<div class="admin-empty">Лог пуст</div>'; return; }
    html += '<div class="admin-table-wrap"><table class="admin-table">' +
      '<thead><tr><th>Время</th><th>TG ID</th><th>Действие</th><th>Данные</th></tr></thead><tbody>';
    log.forEach(function(entry) {
      var dataStr = '';
      try { dataStr = JSON.stringify(entry.data || entry.details || {}).substring(0,80); } catch(e) {}
      html += '<tr>' +
        '<td>' + fmtDate(entry.created_at) + '</td>' +
        '<td>' + (entry.tg_id||'—') + '</td>' +
        '<td><b>' + (entry.action||'—') + '</b></td>' +
        '<td style="font-size:11px;opacity:.7">' + dataStr + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>' +
      '<div class="admin-pagination">' +
        (page > 0 ? '<button class="admin-btn admin-btn-sec" onclick="loadAdminAudit(document.getElementById(\'admin-body\'),'+(page-1)+')">← Назад</button>' : '') +
        '<span style="padding:0 12px;opacity:.6">Стр ' + (page+1) + '</span>' +
        (log.length === 40 ? '<button class="admin-btn admin-btn-sec" onclick="loadAdminAudit(document.getElementById(\'admin-body\'),'+(page+1)+')">Вперёд →</button>' : '') +
      '</div>';
    body.innerHTML = html;
  }).catch(function() { body.innerHTML = '<div class="admin-err">Ошибка загрузки</div>'; });
}
