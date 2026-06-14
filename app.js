"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

// Telegram
var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); tg.requestFullscreen();}


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
    minStars: 100, maxStars: 449,
    gifts: [
      { name: "Vice Cream",   src: "photos/icecream.mp4" },
      { name: "Lunar Snake",  src: "photos/snake.mp4"    },
      { name: "Big Year",     src: "photos/year.mp4"     }
    ]
  },
  {
    minStars: 450, maxStars: 549,
    gifts: [
      { name: "Ice Cream",       src: "photos/icecream.mp4" },
      { name: "Whip Cupcake",    src: "photos/cupcake.mp4"  },
      { name: "Snake Box",       src: "photos/box.mp4"      },
      { name: "Lol Pop",         src: "photos/lolipop.mp4"  },
      { name: "Hypno Lolipop",   src: "photos/hypno.mp4"    }
    ]
  },
  {
    minStars: 500, maxStars: 700,
    gifts: [
      { name: "Ginger Cookie", src: "photos/crystal.mp4" },
      { name: "Tama Gadget",   src: "photos/tama.mp4"    },
      { name: "Desk Calendar", src: "photos/desk.mp4"    },
      { name: "Star Notepad",  src: "photos/note.mp4"    },
      { name: "Witch Hat",     src: "photos/koldun.mp4"  }
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
  { name: "Diamond Ring",    tgs: "photos2/ring.tgs",     stars: 50  },
  { name: "Toy Bear",        tgs: "photos2/bear.tgs",     stars: 75  },
  { name: "Vice Cream",      tgs: "photos2/icecream.tgs", stars: 60  },
  { name: "Party Sparkler",  tgs: "photos2/lighting.tgs", stars: 120 },
  { name: "Big Year",        tgs: "photos2/year.tgs",     stars: 160 },
  { name: "Stellar Rocket",  tgs: "photos2/rocket.tgs",   stars: 200 },
  { name: "Fresh Socks",     tgs: "photos2/socks.tgs",    stars: 40  },
  { name: "Electric Skull",  tgs: "photos2/skull.tgs",    stars: 350 },
  { name: "Witch Hat",       tgs: "photos2/koldun.tgs",   stars: 180 },
  { name: "Lol Pop",         tgs: "photos2/lolipop.tgs",  stars: 65  },
  { name: "Trapped Heart",   tgs: "photos2/heart.tgs",    stars: 90  },
  { name: "Evil Eye",        tgs: "photos2/eye.tgs",      stars: 150 },
  { name: "Scared Cat",      tgs: "photos2/cat.tgs",      stars: 110 },
  { name: "Input Key",       tgs: "photos2/button.tgs",   stars: 80  },
  { name: "Lunar Snake",     tgs: "photos2/snake.tgs",    stars: 220 },
  { name: "Astral Shard",    tgs: "photos2/crystal.tgs",  stars: 300 },
  { name: "Vintage Cigar",   tgs: "photos2/sigareta.tgs", stars: 130 }
];

// ══════════════════════════════════════════════════════════
// ВИДЕО — КАРУСЕЛЬ
// ══════════════════════════════════════════════════════════
var carouselRAF   = null;
var carouselPos   = 0;
var carouselSpeed = 1.8;

function getCarouselHalfWidth() {
  var track = document.getElementById("gifts-track");
  if (!track) return 0;
  return track.scrollWidth / 2;
}

function tickCarousel() {
  var track = document.getElementById("gifts-track");
  if (!track) { carouselRAF = requestAnimationFrame(tickCarousel); return; }
  carouselPos += carouselSpeed;
  var half = getCarouselHalfWidth();
  if (half > 0 && carouselPos >= half) carouselPos -= half;
  track.style.transform = "translateX(-" + carouselPos + "px)";
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function startCarousel() {
  if (carouselRAF) cancelAnimationFrame(carouselRAF);
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function forcePlayAllVideos() {
  document.querySelectorAll("video").forEach(function(v) {
    v.muted  = true;
    v.volume = 0;
    v.loop   = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    if (v.paused || v.ended) {
      var p = v.play();
      if (p && p.catch) p.catch(function() {});
    }
  });
  startCarousel();
}

document.addEventListener("touchstart", forcePlayAllVideos, { passive: true });
document.addEventListener("click",      forcePlayAllVideos, { passive: true });

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") setTimeout(forcePlayAllVideos, 150);
});
window.addEventListener("pageshow",  function() { setTimeout(forcePlayAllVideos, 150); });
window.addEventListener("focus",     function() { setTimeout(forcePlayAllVideos, 200); });

setInterval(function() {
  if (document.visibilityState !== "visible") return;
  if (currentTab !== "spin") return;
  var anyPaused = false;
  document.querySelectorAll("#screen-spin video").forEach(function(v) { if (v.paused) anyPaused = true; });
  if (anyPaused) forcePlayAllVideos();
  if (!carouselRAF) startCarousel();
}, 3000);

// ══════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ══════════════════════════════════════════════════════════
var tabScreens = {
  home:        "screen-home",
  inventory:   "screen-inventory",
  spin:        "screen-spin",
  profile:     "screen-profile",
  settings:    "screen-settings",
  referral:    "screen-referral",
  leaderboard: "screen-leaderboard"
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
    setTimeout(forcePlayAllVideos, 100);
    setTimeout(forcePlayAllVideos, 400);
  }
  if (tab === "spin") {
    var spinWrap = document.getElementById("spin-btn-wrap");
    if (spinWrap) spinWrap.style.marginTop = "";
    var spinBtnEl = document.getElementById("spin-btn");
    if (spinBtnEl) spinBtnEl.disabled = false;
  }
  if (tab === "home") {
    setTimeout(loadTgsAnimations, 80);
  }
  if (tab === "inventory")   loadInventoryPage();
  if (tab === "profile")     { loadProfile(); loadProfileInventory(); }
  if (tab === "settings")    loadSettingsData();
  if (tab === "referral")    loadReferral();
  if (tab === "leaderboard") loadLeaderboard();
}

// ══════════════════════════════════════════════════════════
// ЭКРАНЫ
// ══════════════════════════════════════════════════════════
var ALL_SCREENS = [
  "screen-loading", "screen-home", "screen-inventory",
  "screen-spin", "screen-profile", "screen-settings",
  "screen-referral", "screen-leaderboard",
  "screen-pay", "screen-spinning", "screen-result", "screen-error"
];

function showScreen(id) {
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s) { s.style.display = "none"; s.classList.remove("active"); }
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }
  if (id === "screen-spin") setTimeout(forcePlayAllVideos, 100);
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
  if (spinBtn) spinBtn.textContent = demoMode ? "🎭 Демо-прокрутка" : "Крутить рулетку";
  if (hint)   hint.textContent    = demoMode ? "Бесплатная демо-прокрутка — без ставки" : "Прокрути рулетку чтобы сорвать куш!";
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
var SPIN_DURATION = 3000;  // итоговая длительность замедления, мс

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

function _renderSpinItem(item) {
  if (item.type === "star") {
    return '<div class="spin-overlay-item spin-overlay-star">' +
             '<img src="photos/stars.png" alt="star"/>' +
           '</div>';
  }
  return '<div class="spin-overlay-item">' +
           '<div class="tgs-container" data-tgs="' + item.src + '" style="width:100%;height:100%;"></div>' +
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
  var winIdx = Math.floor(Math.random() * items.length);

  // Дублируем набор несколько раз для длинной прокрутки
  var REPEATS = 6;
  var html = "";
  for (var r = 0; r < REPEATS; r++) {
    for (var i = 0; i < items.length; i++) html += _renderSpinItem(items[i]);
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
  hint.textContent = "Жми, чтобы разогнать!";
  document.body.appendChild(hint);

  requestAnimationFrame(function() {
    blurBg.style.opacity  = "1";
    overlay.style.opacity = "1";
    overlay.style.transform = "translateY(-50%) scale(1)";
    hint.style.opacity = "1";
  });

  setTimeout(function() {
    loadTgsAnimations();
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
  var screenCenter = window.innerWidth / 2;
  var winCenter    = winIdx * itemW + itemW / 2;

  var pos        = 0;
  var taps       = 0;
  var phase      = "wait"; // wait -> spinning -> decel -> done
  var speed      = 0;
  var BASE_SPEED = 6;
  var SPEED_STEP = 9;
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
      var minLoops  = 3;
      var base      = Math.ceil((pos + minLoops * setW) / setW) * setW;
      target        = base + winCenter - screenCenter;
      if (target < pos + setW) target += setW;
      decelStart = performance.now();
      decelFromPos = pos;
      decelFromSpeed = speed;
      phase = "decel";
    }
  }
  tapZone.addEventListener("pointerdown", onTap);

  var decelFromPos = 0, decelFromSpeed = 0;

  function tick() {
    if (phase === "wait") {
      // Лёгкое покачивание/медленный ход в ожидании тапов
      speed = 1.2;
      pos += speed;
      if (setW > 0 && pos >= setW) pos -= setW;
      track.style.transform = "translateX(-" + pos + "px)";
      spinAnimRAF = requestAnimationFrame(tick);
      return;
    }
    if (phase === "spinning") {
      pos += speed;
      if (setW > 0 && pos >= setW) pos -= setW;
      track.style.transform = "translateX(-" + pos + "px)";
      spinAnimRAF = requestAnimationFrame(tick);
      return;
    }
    if (phase === "decel") {
      var elapsed  = performance.now() - decelStart;
      var progress = Math.min(elapsed / SPIN_DURATION, 1);
      var ease     = 1 - Math.pow(1 - progress, 3);
      pos = decelFromPos + (target - decelFromPos) * ease;
      track.style.transform = "translateX(-" + pos + "px)";
      if (progress >= 1) {
        pos = target;
        track.style.transform = "translateX(-" + pos + "px)";
        phase = "done";
        haptic("heavy");
        setTimeout(function() {
          _teardownSpinOverlay(blurBg, overlay, tapZone, hint);
          if (onDone) onDone(winIdx);
        }, 450);
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

  // Демо-шансы: 30% звёзды, 70% НФТ — решаем заранее, чтобы знать,
  // подсовывать ли звёздочку в линию подарков
  var showNft = Math.random() < 0.70;

  startSpinAnimation(function() {
    demoCycleCount++;
    if (btnWrap) btnWrap.style.opacity = "";
    if (spinBtn) spinBtn.disabled = false;

    if (showNft) {
      // Показать рандомный НФТ из любого тира
      var allGifts = [];
      NFT_TIERS.forEach(function(t) { allGifts = allGifts.concat(t.gifts); });
      var gift = allGifts[Math.floor(Math.random() * allGifts.length)];
      confetti();
      haptic("heavy");
      showNftVideoOverlay(gift, true, null);
    } else {
      // Показать звёзды (1–5)
      var starCount = 1 + Math.floor(Math.random() * 5);
      showStarsEffect(starCount, null);
    }
  }, showNft);
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
      startSpinAnimation(function() {
        if (btnWrap) btnWrap.style.opacity = "";
        showResult(res);
      }, isWin);
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
  if (res.result === "win") {
    haptic("heavy");
    confetti();
    // Определяем видео по nft_stars
    var nftStars = res.nft_stars || 300;
    var nftGift  = getRandomNftGift(nftStars);

    // Показываем видео NFT на 3 сек, затем экран результата
    showNftVideoOverlay({ name: res.nft_name || nftGift.name, src: nftGift.src }, false, function() {
      _showWinResultScreen(res);
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
  setTimeout(loadTgsAnimations, 120);
}

function startApp() {
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
    if (startParam && startParam.startsWith("ref_")) {
      var parsed = parseInt(startParam.substring(4), 10);
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
  forcePlayAllVideos();
  startApp();
  setTimeout(forcePlayAllVideos, 300);
  setTimeout(forcePlayAllVideos, 800);
  setTimeout(forcePlayAllVideos, 1500);
  setTimeout(function() {
    document.querySelectorAll("#screen-home video, #screen-spin video").forEach(function(v) {
      v.muted = true; v.volume = 0; v.loop = true;
      v.setAttribute("muted",""); v.setAttribute("playsinline","");
      v.setAttribute("webkit-playsinline",""); v.setAttribute("autoplay","");
      var p = v.play(); if (p && p.catch) p.catch(function(){});
    });
  }, 600);
});

// ══════════════════════════════════════════════════════════
// TGS ЗАГРУЗЧИК
// ══════════════════════════════════════════════════════════
function loadTgsAnimations() {
  var containers = document.querySelectorAll('.tgs-container[data-tgs]');
  containers.forEach(function(container) {
    var src = container.getAttribute('data-tgs');
    if (!src || container._tgsLoaded) return;
    container._tgsLoaded = true;

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
          var text = new TextDecoder('utf-8').decode(decompressed);
          json = JSON.parse(text);
        } catch(e) {
          try {
            var text2 = new TextDecoder('utf-8').decode(uint8);
            json = JSON.parse(text2);
          } catch(e2) {
            console.warn('TGS parse error:', src, e2);
            container._tgsLoaded = false;
            return;
          }
        }

        container.innerHTML = '';
        var anim = lottie.loadAnimation({
          container: container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: json,
          rendererSettings: {
            progressiveLoad: false,
            hideOnTransparent: false,
            viewBoxOnly: true
          }
        });
        setTimeout(function() { try { anim.resize(); } catch(e) {} }, 200);
        setTimeout(function() { try { anim.resize(); } catch(e) {} }, 600);
      })
      .catch(function(e) {
        console.warn('TGS fetch error:', src, e);
        container._tgsLoaded = false;
      });
  });
}
