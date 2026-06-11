"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

// ── Telegram ──────────────────────────────────────────────
var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

var tgUser    = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {};
var TG_ID     = tgUser.id         || 0;
var TG_NAME   = tgUser.username   || tgUser.first_name || "user";
var TG_FIRST  = tgUser.first_name || "";
var INIT_DATA = (tg && tg.initData) ? tg.initData : "";

// ── Состояние ─────────────────────────────────────────────
var currentTab       = "home";
var currentBetId     = null;
var payCheckAttempts = 0;
var payCheckTimer    = null;
var PAY_MAX_ATTEMPTS = 24;

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

// Home blocks use .tgs lottie-player — no video polling needed

// ══════════════════════════════════════════════════════════
// НАВИГАЦИЯ — переключение вкладок БЕЗ перезагрузки
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
  // Скрываем все основные вкладки
  Object.keys(tabScreens).forEach(function(key) {
    var el = document.getElementById(tabScreens[key]);
    if (el) { el.style.display = "none"; el.classList.remove("active"); }
  });

  // Показываем нужную
  currentTab = tab;
  var el = document.getElementById(tabScreens[tab]);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }

  // Активируем кнопки текущего таба по data-tab атрибуту
  document.querySelectorAll(".nav-tab").forEach(function(btn) {
    btn.classList.remove("active");
    if (btn.getAttribute("data-tab") === tab) btn.classList.add("active");
  });

  haptic("light");

  // Доп. действия при переходе
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
    // Перезагрузить TGS если ещё не загружены (или была ошибка)
    setTimeout(loadTgsAnimations, 80);
  }
  if (tab === "inventory") {
    loadInventoryPage();
  }
  if (tab === "profile") {
    loadProfile();
    loadProfileInventory();
  }
  if (tab === "settings") {
    loadSettingsData();
  }
  if (tab === "referral") {
    loadReferral();
  }
  if (tab === "leaderboard") {
    loadLeaderboard();
  }
}

// ══════════════════════════════════════════════════════════
// ЭКРАНЫ ВНУТРИ (оплата / спин / результат / ошибка)
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
// АУДИО — кнопки на главной
// ══════════════════════════════════════════════════════════
var currentHbAudio = null;
var currentHbBtn   = null;

function playHbAudio(audioId, btn) {
  var audio = document.getElementById(audioId);
  if (!audio) return;

  // Если уже играет этот же — стопим
  if (currentHbAudio === audio && !audio.paused) {
    audio.pause();
    audio.currentTime = 0;
    if (currentHbBtn) { currentHbBtn.textContent = "▶"; currentHbBtn.classList.remove("playing"); }
    currentHbAudio = null; currentHbBtn = null;
    return;
  }

  // Стопаем предыдущий
  if (currentHbAudio && !currentHbAudio.paused) {
    currentHbAudio.pause();
    currentHbAudio.currentTime = 0;
    if (currentHbBtn) { currentHbBtn.textContent = "▶"; currentHbBtn.classList.remove("playing"); }
  }

  currentHbAudio = audio;
  currentHbBtn   = btn;
  btn.textContent = "■";
  btn.classList.add("playing");
  haptic("light");

  audio.play().catch(function() {});
  audio.onended = function() {
    btn.textContent = "▶";
    btn.classList.remove("playing");
    currentHbAudio = null; currentHbBtn = null;
  };
}

// ══════════════════════════════════════════════════════════
// API helper
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

  // Загружаем фото профиля из Telegram
  var photoEl = document.getElementById("profile-tg-photo");
  var fallbackEl = document.getElementById("profile-avatar-fallback");
  if (photoEl && tgUser && tgUser.photo_url) {
    photoEl.src = tgUser.photo_url;
    photoEl.style.display = "block";
    if (fallbackEl) fallbackEl.style.display = "none";
  } else if (photoEl) {
    // Попробуем получить фото через API
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
      var sc = document.getElementById("stat-cycles"); // FIX: sc was undefined
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
// ДЕМО-РЕЖИМ И АНИМАЦИЯ РУЛЕТКИ
// Трек выезжает на передний план, разгоняется, замедляется,
// останавливается на случайном NFT. Работает и в реал-спине,
// и в демо (без ставки).
// ══════════════════════════════════════════════════════════

var DEMO_GIFTS = [
  { name: "💍 Кольцо",    stars: 50  },
  { name: "🐻 Медведь",   stars: 75  },
  { name: "🍦 Мороженое", stars: 60  },
  { name: "⚡ Молния",    stars: 120 },
  { name: "🚀 Ракета",    stars: 200 },
  { name: "🧦 Носки",     stars: 40  },
  { name: "💀 Череп",     stars: 350 },
  { name: "🔮 Колдун",    stars: 180 },
  { name: "🍭 Леденец",   stars: 65  },
  { name: "❤️ Сердце",    stars: 90  },
  { name: "👁 Глаз",      stars: 150 },
  { name: "🐱 Кот",       stars: 110 },
  { name: "💎 Кристалл",  stars: 300 },
  { name: "🐍 Змея",      stars: 220 },
  { name: "🚬 Сигарета",  stars: 130 }
];

var spinAnimRAF      = null;
var spinAnimSpeed    = 0;
var spinAnimPos      = 0;
var spinAnimPhase    = "idle";
var spinAnimTarget   = 0;
var spinAnimCB       = null;
var spinAnimWinIdx   = 0;

function getTrackItemWidth() {
  var track = document.getElementById("gifts-track");
  if (!track || !track.children.length) return 202;
  var v = track.children[0];
  return v.offsetWidth + 12;
}

function _liftTrack(up) {
  var wrap = document.querySelector(".gifts-track-wrap");
  var spinScreen = document.getElementById("screen-spin");
  var overlay = document.getElementById("spin-overlay");

  if (up) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "spin-overlay";
      overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.82);z-index:199;pointer-events:none;";
      document.body.appendChild(overlay);
    }
    if (wrap) {
      wrap.style.cssText = "position:fixed;top:50%;left:0;right:0;height:214px;transform:translateY(-50%);" +
        "z-index:200;-webkit-mask-image:none;mask-image:none;background:transparent;" +
        "display:flex;align-items:center;overflow:hidden;";
    }
    // Прицел
    var aim = document.getElementById("spin-aim-line");
    if (!aim) {
      aim = document.createElement("div");
      aim.id = "spin-aim-line";
      aim.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);" +
        "width:192px;height:192px;border:2.5px solid rgba(245,197,24,0.95);border-radius:20px;" +
        "box-shadow:0 0 28px rgba(245,197,24,0.55),inset 0 0 18px rgba(245,197,24,0.08);" +
        "z-index:202;pointer-events:none;animation:aim-pulse 0.7s ease-in-out infinite;";
      document.body.appendChild(aim);
    }
  } else {
    if (overlay) { overlay.remove(); }
    var aim2 = document.getElementById("spin-aim-line");
    if (aim2) aim2.remove();
    if (wrap) {
      wrap.style.cssText = "";
    }
    carouselPos = spinAnimPos % (getTrackItemWidth() * 17 || 3434);
    setTimeout(startCarousel, 300);
  }
}

function startSpinAnimation(onDone) {
  if (carouselRAF) { cancelAnimationFrame(carouselRAF); carouselRAF = null; }
  if (spinAnimRAF) { cancelAnimationFrame(spinAnimRAF); spinAnimRAF = null; }

  var itemW       = getTrackItemWidth();
  var totalItems  = 17; // половина трека (дублированный)
  var halfWidth   = itemW * totalItems;

  spinAnimPos     = carouselPos;
  spinAnimSpeed   = Math.max(carouselSpeed, 2);
  spinAnimPhase   = "accel";
  spinAnimCB      = onDone;
  spinAnimWinIdx  = Math.floor(Math.random() * totalItems);

  // Целевая позиция: ≥5 полных кругов + остановка на winIdx (по центру экрана)
  var screenCenter = window.innerWidth / 2;
  var winItemCenter = spinAnimWinIdx * itemW + itemW / 2;
  var base = Math.ceil(spinAnimPos / halfWidth + 5) * halfWidth;
  spinAnimTarget = base + winItemCenter - screenCenter;
  if (spinAnimTarget < spinAnimPos + halfWidth * 3) spinAnimTarget += halfWidth;

  _liftTrack(true);
  tickSpinAnim(itemW, halfWidth);
  return spinAnimWinIdx;
}

function tickSpinAnim(itemW, halfWidth) {
  var track = document.getElementById("gifts-track");
  if (!track) return;
  var SPEED_MAX   = 52;
  var ACCEL       = 1.8;
  var SPEED_MIN   = 0.3;

  if (spinAnimPhase === "accel") {
    spinAnimSpeed = Math.min(spinAnimSpeed + ACCEL, SPEED_MAX);
    if (spinAnimSpeed >= SPEED_MAX - 0.5) spinAnimPhase = "max";
  }
  if (spinAnimPhase === "max") {
    var rem = spinAnimTarget - spinAnimPos;
    if (rem < SPEED_MAX * 55) spinAnimPhase = "decel";
  }
  if (spinAnimPhase === "decel") {
    var rem = spinAnimTarget - spinAnimPos;
    if (rem <= 0) {
      spinAnimPos   = spinAnimTarget % halfWidth;
      spinAnimPhase = "done";
    } else {
      var t = Math.max(0, Math.min(1, rem / (SPEED_MAX * 55)));
      spinAnimSpeed = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * Math.pow(t, 0.65);
      spinAnimSpeed = Math.max(spinAnimSpeed, SPEED_MIN);
    }
  }

  spinAnimPos += spinAnimSpeed;
  if (halfWidth > 0 && spinAnimPos >= halfWidth) spinAnimPos -= halfWidth;
  track.style.transform = "translateX(-" + spinAnimPos + "px)";

  if (spinAnimPhase === "done") {
    haptic("heavy");
    setTimeout(function() {
      _liftTrack(false);
      if (spinAnimCB) spinAnimCB();
    }, 380);
    return;
  }
  spinAnimRAF = requestAnimationFrame(function() { tickSpinAnim(itemW, halfWidth); });
}

// ──────────────────────────────────────────────
// ДЕМО-РЕЗУЛЬТАТ
// ──────────────────────────────────────────────
function showDemoResult(gift) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) return;
  haptic("heavy");
  confetti();
  wrap.innerHTML =
    '<div class="result-demo-badge">ДЕМО</div>' +
    '<div class="result-icon">🎉</div>' +
    '<div class="result-title win">Выпало: ' + gift.name + '</div>' +
    '<div class="result-nft">' +
      '<div class="result-nft-name">' + gift.name + '</div>' +
      '<div class="result-nft-info">' + gift.stars + '⭐ · Демо-режим</div>' +
    '</div>' +
    '<div class="result-sub">🎭 Это демо-прокрутка — без реальной ставки.<br>Нажми «Крутить реально» чтобы играть по-настоящему!</div>' +
    '<button class="result-btn" onclick="switchTab(\'spin\')">Крутить реально</button>' +
    '<button class="result-btn result-btn-ghost" onclick="onDemoSpin()">Ещё раз (демо)</button>';
  showScreen("screen-result");
}

function onDemoSpin() {
  var spinBtn = document.getElementById("spin-btn");
  var btnWrap = document.getElementById("spin-btn-wrap");

  // Переключаемся на экран рулетки
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s) { s.style.display = "none"; s.classList.remove("active"); }
  });
  var spinEl = document.getElementById("screen-spin");
  if (spinEl) { spinEl.style.display = "flex"; spinEl.classList.add("active"); }
  currentTab = "spin";

  if (btnWrap) btnWrap.style.opacity = "0";
  if (spinBtn) spinBtn.disabled = true;

  setTimeout(function() {
    var winIdx = startSpinAnimation(function() {
      if (btnWrap) btnWrap.style.opacity = "";
      if (spinBtn) spinBtn.disabled = false;
      var gift = DEMO_GIFTS[winIdx % DEMO_GIFTS.length];
      showDemoResult(gift);
    });
  }, 200);
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
  var colors = ["#F5C518","#FF5E5B","#ffffff","#A8FF78","#B388FF","#FFD84D"];
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
  // Показываем экран рулетки для анимации
  ALL_SCREENS.forEach(function(sid) {
    var s = document.getElementById(sid);
    if (s && sid !== "screen-spin") { s.style.display = "none"; s.classList.remove("active"); }
  });
  var spinEl = document.getElementById("screen-spin");
  if (spinEl) { spinEl.style.display = "flex"; spinEl.classList.add("active"); }
  currentTab = "spin";

  var btnWrap = document.getElementById("spin-btn-wrap");
  if (btnWrap) btnWrap.style.opacity = "0";

  setTimeout(function() {
    startSpinAnimation(function() {
      if (btnWrap) btnWrap.style.opacity = "";
      doSpin();
    });
  }, 200);
}

function doSpin() {
  if (!currentBetId) {
    showError("Ошибка", "Нет активной ставки.", function() { switchTab("spin"); });
    return;
  }
  api("/spin", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = null;
      showResult(res);
    })
    .catch(function(e) {
      showError("Ошибка спина", (e && e.message) || "Обратись в поддержку.", function() { switchTab("spin"); });
    });
}

function showResult(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { switchTab("spin"); return; }

  if (res.result === "win") {
    haptic("heavy");
    confetti();
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
  } else {
    haptic("medium");
    var nextWinText = res.next_win_in ? "До выигрыша: " + res.next_win_in + " ставки" : "";
    wrap.innerHTML =
      '<div class="result-icon">😔</div>' +
      '<div class="result-title lose">Не повезло</div>' +
      '<div class="result-sub">Попробуй ещё раз!<br>' + (nextWinText ? '<b>' + nextWinText + '</b>' : '') + '</div>' +
      '<button class="result-btn" onclick="switchTab(\'spin\')">Попробовать снова</button>';
  }
  showScreen("screen-result");
}


// ══════════════════════════════════════════════════════════
// РЕФЕРАЛЬНАЯ СИСТЕМА
// Формат ссылки: https://t.me/virus_play_bot/app?startapp=ref_TGID
// ══════════════════════════════════════════════════════════
var BOT_USERNAME = "virus_play_bot";
var APP_NAME     = "app";  // имя mini app в боте

function getRefLink() {
  return "https://t.me/" + BOT_USERNAME + "/" + APP_NAME + "?startapp=ref_" + TG_ID;
}

function loadReferral() {
  var refLink = getRefLink();
  var linkBox = document.getElementById("ref-link-box");
  if (linkBox) linkBox.textContent = refLink;

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
      // fallback
      var ta = document.createElement("textarea");
      ta.value = refLink;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand("copy"); toast("Ссылка скопирована! 🔗"); } catch(e) { toast("Скопируй ссылку вручную"); }
      document.body.removeChild(ta);
    });
  } else {
    toast("Скопируй ссылку вручную");
  }
}

function shareRefLink() {
  var refLink = getRefLink();
  var shareText = "🎰 Играй в LEONARDO GAME — выигрывай NFT-подарки Telegram!\n\n✅ Первый выигрыш гарантирован на 3-й ставке!";
  if (tg && tg.openTelegramLink) {
    var shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(refLink) + "&text=" + encodeURIComponent(shareText);
    tg.openTelegramLink(shareUrl);
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
  var labels = ["1", "2", "3"];

  var p1 = top3[0] || null;
  var p2 = top3[1] || null;
  var p3 = top3[2] || null;

  function podCard(p, rank, highlight) {
    if (!p) return "<div class='lb-pod-card lb-pod-empty'></div>";
    return "<div class='lb-pod-card" + (highlight ? " lb-pod-first" : "") + "'>" +
      "<div class='lb-pod-medal'>" + medals[rank] + "</div>" +
      "<div class='lb-pod-avatar'>👤</div>" +
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

function renderLbPage() {
  var list = document.getElementById("lb-rest-list");
  var pageInfo = document.getElementById("lb-page-info");
  if (!list) return;

  var rest = lbData.slice(3); // позиции 4-100
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
      return "<div class='lb-row" + (isMe ? " lb-row-me" : "") + "'>" +
        "<div class='lb-row-rank'>" + rank + "</div>" +
        "<div class='lb-row-avatar'>👤</div>" +
        "<div class='lb-row-name'>@" + (p.username || "игрок") + "</div>" +
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
    // Сбрасываем сдвиг
    var spinWrap = document.getElementById("spin-btn-wrap");
    if (spinWrap) spinWrap.style.marginTop = "";
    // Возвращаемся на экран рулетки
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
    var spinBtn = document.getElementById("spin-btn");
    if (spinBtn) spinBtn.disabled = false;
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
  // Грузим TGS анимации теперь, когда экран виден
  setTimeout(loadTgsAnimations, 120);
}

function startApp() {
  var loadEl = document.getElementById("load-status");
  if (loadEl) loadEl.textContent = "Загрузка...";

  // Читаем реферальный параметр из Telegram start_param (Mini App формат: ?startapp=ref_XXX)
  var referrerId = null;
  var isRefVisit = false;
  try {
    var startParam = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param)
      ? tg.initDataUnsafe.start_param : "";
    if (!startParam) {
      // fallback: читаем из URL напрямую
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

  // Dev-режим без Telegram
  if (!TG_ID) {
    showHomeScreen();
    return;
  }

  var appShown = false;
  function finishInit(alreadyReg) {
    if (appShown) return;
    appShown = true;
    showHomeScreen();
    // Показываем уведомление о реферале
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
  // Принудительно запускаем видео на главной
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
// TGS ЗАГРУЗЧИК — pako (gunzip) + lottie-web
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
          // TGS = gzip-сжатый Lottie JSON
          var decompressed = pako.inflate(uint8);
          var text = new TextDecoder('utf-8').decode(decompressed);
          json = JSON.parse(text);
        } catch(e) {
          // Может уже быть JSON (не сжатый)
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
        // SVG рендерер — работает даже когда контейнер был скрыт
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
        // Принудительный resize после появления
        setTimeout(function() {
          try { anim.resize(); } catch(e) {}
        }, 200);
        setTimeout(function() {
          try { anim.resize(); } catch(e) {}
        }, 600);
      })
      .catch(function(e) {
        console.warn('TGS fetch error:', src, e);
        container._tgsLoaded = false; // Разрешаем повторную попытку
      });
  });
}

// TGS загружаются из showHomeScreen() — когда главная точно видна  
