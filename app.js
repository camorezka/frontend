"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

var tgUser   = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {};
var TG_ID    = tgUser.id         || 0;
var TG_NAME  = tgUser.username   || tgUser.first_name || "user";
var TG_FIRST = tgUser.first_name || "";
var INIT_DATA = (tg && tg.initData) ? tg.initData : "";

var currentBetId     = null;
var payCheckAttempts = 0;
var payCheckTimer    = null;
var PAY_MAX_ATTEMPTS = 24;

// ══════════════════════════════════════════════════════════
// МАППИНГ ПРИЗОВ (файл → название)
// ══════════════════════════════════════════════════════════
var GIFT_MAP = {
  "bear":     { name: "Toy Bear",       stars: 60  },
  "ring2":    { name: "Nail Bracelet",  stars: 80  },
  "icecream": { name: "Vice Cream",     stars: 45  },
  "lighting": { name: "Party Sparkler", stars: 200 },
  "sushi":    { name: "Instant Ramen",  stars: 55  },
  "socks":    { name: "Fresh Socks",    stars: 30  },
  "ring":     { name: "Diamond Ring",   stars: 120 },
  "rocket":   { name: "Stellar Rocket", stars: 500 }
};

// Порядок видео в треке (должен совпадать с HTML)
var TRACK_ORDER = ["ring","bear","icecream","lighting","ring2","rocket","socks","sushi"];

// ══════════════════════════════════════════════════════════
// ВИДЕО — ГАРАНТИРОВАННОЕ ВОСПРОИЗВЕДЕНИЕ
// ══════════════════════════════════════════════════════════
var carouselRAF   = null;
var carouselPos   = 0;
var carouselSpeed = 0.8; // немного быстрее чем было

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

function stopCarousel() {
  if (carouselRAF) { cancelAnimationFrame(carouselRAF); carouselRAF = null; }
}

function forcePlayAllVideos() {
  document.querySelectorAll("video").forEach(function(v) {
    v.muted = true; v.volume = 0; v.loop = true;
    v.setAttribute("muted",""); v.setAttribute("playsinline","");
    v.setAttribute("webkit-playsinline",""); v.setAttribute("x5-playsinline","true");
    if (v.paused || v.ended) { var p = v.play(); if (p && p.catch) p.catch(function(){}); }
  });
  startCarousel();
}

var videoUnlocked = false;
function unlockVideos() { videoUnlocked = true; forcePlayAllVideos(); }
document.addEventListener("touchstart", unlockVideos, { passive: true });
document.addEventListener("click",      unlockVideos, { passive: true });
document.addEventListener("touchend",   unlockVideos, { passive: true });

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") setTimeout(forcePlayAllVideos, 150);
});
window.addEventListener("pageshow", function() { setTimeout(forcePlayAllVideos, 150); });
window.addEventListener("focus",    function() { setTimeout(forcePlayAllVideos, 200); });

setInterval(function() {
  if (document.visibilityState !== "visible") return;
  var main = document.getElementById("screen-main");
  if (!main || !main.classList.contains("active")) return;
  var anyPaused = false;
  document.querySelectorAll("#screen-main video").forEach(function(v) { if (v.paused) anyPaused = true; });
  if (anyPaused) forcePlayAllVideos();
  if (!carouselRAF) startCarousel();
}, 3000);

function setupVideoObserver() {
  if (!window.IntersectionObserver) { forcePlayAllVideos(); return; }
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) { var v = e.target; v.muted = true; if (v.paused) v.play().catch(function(){}); }
    });
  }, { threshold: 0.05 });
  document.querySelectorAll("video").forEach(function(v) { obs.observe(v); });
}

// ══════════════════════════════════════════════════════════
// УТИЛИТЫ
// ══════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("active"); s.style.display = "none";
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }
  if (id === "screen-main") setTimeout(forcePlayAllVideos, 100);
}

function showError(title, sub, onRetry) {
  var t = document.getElementById("error-title");
  var s = document.getElementById("error-sub");
  var b = document.getElementById("error-btn");
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
  if (b) b.onclick = onRetry || function() { showScreen("screen-main"); };
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

function setPayStatus(msg, cls) {
  var el = document.getElementById("pay-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "pay-status" + (cls ? " " + cls : "");
}

function api(path, data) {
  var opts = { method: "GET", headers: { "Content-Type": "application/json" } };
  if (data !== undefined) { opts.method = "POST"; opts.body = JSON.stringify(data); }
  return fetch(API_URL + path, opts).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || ("HTTP " + r.status)); });
    return r.json();
  });
}

function confetti() {
  var colors = ["#F5C518","#FF5E5B","#ffffff","#A8FF78","#B388FF","#FFD84D"];
  var container = document.getElementById("confetti-container");
  if (!container) return;
  for (var i = 0; i < 50; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement("div");
        p.className = "confetti-p";
        var fromRight = idx >= 25;
        var color = colors[Math.floor(Math.random() * colors.length)];
        var w = 7 + Math.random() * 8, h = 10 + Math.random() * 12;
        var dur = 1.4 + Math.random() * 0.8;
        var rot = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
        var xPct = fromRight ? (80 + Math.random() * 20) : (Math.random() * 20);
        var vx = fromRight ? -(30 + Math.random() * 80) : (30 + Math.random() * 80);
        p.style.cssText = ["width:"+w+"px","height:"+h+"px","background:"+color,"left:"+xPct+"%","--cx:"+vx+"px","--cr:"+rot+"deg","animation-duration:"+dur+"s"].join(";");
        document.body.appendChild(p);
        setTimeout(function() { p.remove(); }, (dur + 0.2) * 1000);
      }, idx * 30);
    })(i);
  }
}

function loadInventory() {}
function bindSettings() {
  var toggle = document.getElementById("toggle-notif");
  if (toggle) toggle.onclick = function() { toggle.classList.toggle("on"); haptic("light"); };
}

// ══════════════════════════════════════════════════════════
// НОВАЯ АНИМАЦИЯ РУЛЕТКИ — прямо на треке
// ══════════════════════════════════════════════════════════

var spinInProgress = false;

// Получить индекс видео в треке по ключу подарка
function getTrackIndex(giftKey) {
  for (var i = 0; i < TRACK_ORDER.length; i++) {
    if (TRACK_ORDER[i] === giftKey) return i;
  }
  return 0;
}

// Вычислить позицию в треке для центрирования нужного видео
function getTargetPosition(targetIndex) {
  var track = document.getElementById("gifts-track");
  if (!track) return 0;
  var videos = track.querySelectorAll("video");
  if (!videos.length) return 0;

  var vw = videos[0].offsetWidth + 12; // ширина + gap
  var wrapW = track.parentElement ? track.parentElement.offsetWidth : window.innerWidth;
  // Хотим чтобы targetIndex оказался по центру wrap
  var targetPos = vw * targetIndex - (wrapW / 2 - vw / 2);
  return Math.max(0, targetPos);
}

function runSpinAnimation(giftKey, onDone) {
  stopCarousel();
  var track = document.getElementById("gifts-track");
  if (!track) { if (onDone) onDone(); return; }

  var half = getCarouselHalfWidth();
  var targetIndex = getTrackIndex(giftKey);
  var targetPos = getTargetPosition(targetIndex);

  // Нормализуем позицию — добавляем несколько полных кругов для эффекта
  var laps = 3; // количество полных прокруток
  var destination = carouselPos + laps * half + (targetPos - (carouselPos % half));
  if (destination - carouselPos < half) destination += half;

  var startPos = carouselPos;
  var startTime = null;
  var duration = 3200; // мс

  // Easing: сначала ускорение, потом плавное замедление
  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animFrame(ts) {
    if (!startTime) startTime = ts;
    var elapsed = ts - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var eased = easeOutQuart(progress);

    carouselPos = startPos + (destination - startPos) * eased;
    // Бесшовный loop
    if (half > 0 && carouselPos >= half) carouselPos -= half;
    track.style.transform = "translateX(-" + carouselPos + "px)";

    if (progress < 1) {
      carouselRAF = requestAnimationFrame(animFrame);
    } else {
      carouselPos = targetPos % half;
      track.style.transform = "translateX(-" + carouselPos + "px)";
      // Подсветка выигравшего
      highlightWinner(targetIndex);
      haptic("heavy");
      setTimeout(function() {
        startCarousel();
        if (onDone) onDone();
      }, 900);
    }
  }

  haptic("medium");
  carouselRAF = requestAnimationFrame(animFrame);
}

function highlightWinner(index) {
  var track = document.getElementById("gifts-track");
  if (!track) return;
  var videos = track.querySelectorAll("video");
  videos.forEach(function(v, i) {
    v.style.transition = "transform 0.3s, box-shadow 0.3s, opacity 0.3s";
    if (i === index || i === index + TRACK_ORDER.length) {
      v.style.transform = "scale(1.12)";
      v.style.boxShadow = "0 0 32px rgba(255,216,77,0.8), 0 0 60px rgba(255,216,77,0.4)";
      v.style.opacity = "1";
    } else {
      v.style.opacity = "0.35";
    }
  });
}

function resetHighlight() {
  var track = document.getElementById("gifts-track");
  if (!track) return;
  track.querySelectorAll("video").forEach(function(v) {
    v.style.transform = "";
    v.style.boxShadow = "";
    v.style.opacity = "";
    v.style.transition = "";
  });
}

// ══════════════════════════════════════════════════════════
// ОВЕРЛЕЙ РЕЗУЛЬТАТА (общий для демо и реального)
// ══════════════════════════════════════════════════════════
function showWinOverlay(giftKey, isDemo, onClose) {
  var gift = GIFT_MAP[giftKey] || { name: "NFT Gift", stars: 50 };
  var existing = document.getElementById("spin-result-overlay");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "spin-result-overlay";
  overlay.className = "spin-result-overlay";

  var demoTag = isDemo
    ? '<div class="sro-demo-badge">ДЕМО РЕЖИМ</div>'
    : '';

  var subText = isDemo
    ? 'В реальной игре он стал бы твоим!'
    : '🕐 NFT будет отправлен через 21 день.<br>Он уже в твоём инвентаре!';

  overlay.innerHTML =
    '<div class="sro-card">' +
      '<div class="sro-glow"></div>' +
      demoTag +
      '<div class="sro-win-label">Ты выиграл!</div>' +
      '<div class="sro-gift-name">' + gift.name + '</div>' +
      '<div class="sro-stars">' + gift.stars + ' ⭐</div>' +
      '<div class="sro-sub">' + subText + '</div>' +
      '<button class="sro-btn" id="sro-close-btn">Крутить ещё</button>' +
    '</div>';

  document.body.appendChild(overlay);

  // Анимация появления
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { overlay.classList.add("active"); });
  });

  document.getElementById("sro-close-btn").onclick = function() {
    overlay.classList.remove("active");
    setTimeout(function() { overlay.remove(); if (onClose) onClose(); }, 300);
  };
}

function showLoseOverlay(nextWinIn, onClose) {
  var existing = document.getElementById("spin-result-overlay");
  if (existing) existing.remove();

  var overlay = document.createElement("div");
  overlay.id = "spin-result-overlay";
  overlay.className = "spin-result-overlay";

  overlay.innerHTML =
    '<div class="sro-card">' +
      '<div class="sro-lose-icon">😔</div>' +
      '<div class="sro-lose-label">Не повезло</div>' +
      (nextWinIn ? '<div class="sro-sub">До выигрыша: <b>' + nextWinIn + ' ставки</b></div>' : '<div class="sro-sub">Попробуй ещё раз!</div>') +
      '<button class="sro-btn" id="sro-close-btn">Попробовать снова</button>' +
    '</div>';

  document.body.appendChild(overlay);

  requestAnimationFrame(function() {
    requestAnimationFrame(function() { overlay.classList.add("active"); });
  });

  document.getElementById("sro-close-btn").onclick = function() {
    overlay.classList.remove("active");
    setTimeout(function() { overlay.remove(); if (onClose) onClose(); }, 300);
  };
}

// ══════════════════════════════════════════════════════════
// ДЕМО РЕЖИМ
// ══════════════════════════════════════════════════════════
var demoMode = false;

function bindDemoToggle() {
  var toggle = document.getElementById("demo-toggle");
  if (!toggle) return;
  toggle.addEventListener("change", function() {
    demoMode = toggle.checked;
    haptic("light");
  });
}

function runDemoSpin() {
  if (spinInProgress) return;
  spinInProgress = true;
  var btn = document.getElementById("spin-btn");
  if (btn) btn.disabled = true;
  haptic("medium");

  resetHighlight();

  // Выбираем победителя (в демо шансы выше — всегда выигрыш)
  var keys = Object.keys(GIFT_MAP);
  var giftKey = keys[Math.floor(Math.random() * keys.length)];

  runSpinAnimation(giftKey, function() {
    spinInProgress = false;
    if (btn) btn.disabled = false;
    showWinOverlay(giftKey, true, function() {
      resetHighlight();
    });
  });
}

// ══════════════════════════════════════════════════════════
// РЕАЛЬНАЯ ИГРА
// ══════════════════════════════════════════════════════════
function onSpinClick() {
  if (spinInProgress) return;
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

      if (res.bet_status === "paid") {
        if (btn) btn.disabled = false;
        doRealSpin();
        return;
      }

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
        setTimeout(function() { showScreen("screen-main"); doRealSpin(); }, 600);
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
        setTimeout(function() { showScreen("screen-main"); doRealSpin(); }, 800);
      } else {
        setPayStatus("Кольца не найдены (" + (res.rings_found || 0) + "/2). " + (res.reason || "Попробуй чуть позже."), "err");
      }
    }).catch(function(e) {
      if (btn) btn.disabled = false;
      setPayStatus("Ошибка: " + (e.message || "попробуй снова"), "err");
    });
}

function doRealSpin() {
  if (spinInProgress) return;
  spinInProgress = true;
  resetHighlight();

  if (!currentBetId) {
    spinInProgress = false;
    showError("Ошибка", "Нет активной ставки.", function() { showScreen("screen-main"); });
    return;
  }

  // Запрашиваем результат с бэкенда
  api("/spin", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = null;
      loadInventory();

      // Определяем ключ подарка из ответа бэкенда
      var giftKey = resolveGiftKey(res.nft_name);

      if (res.result === "win") {
        confetti();
        runSpinAnimation(giftKey, function() {
          spinInProgress = false;
          showWinOverlay(giftKey, false, function() { resetHighlight(); });
        });
      } else {
        // Проигрыш — крутим рандомно и останавливаемся
        var keys = Object.keys(GIFT_MAP);
        var rndKey = keys[Math.floor(Math.random() * keys.length)];
        runSpinAnimation(rndKey, function() {
          spinInProgress = false;
          resetHighlight();
          showLoseOverlay(res.next_win_in, null);
        });
      }

      // Обновляем статистику тихо
      return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
    })
    .then(function(stats) {
      if (!stats) return;
      var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
      var sEl = document.getElementById("top-stats");
      if (sEl) sEl.textContent = total + " ставок";
    })
    .catch(function(e) {
      spinInProgress = false;
      showError("Ошибка спина", (e && e.message) || "Обратись в поддержку.", function() { showScreen("screen-main"); });
    });
}

// Пытаемся угадать ключ подарка по названию с бэкенда
function resolveGiftKey(nftName) {
  if (!nftName) return Object.keys(GIFT_MAP)[0];
  var lower = nftName.toLowerCase();
  for (var key in GIFT_MAP) {
    if (lower.indexOf(GIFT_MAP[key].name.toLowerCase()) !== -1 || lower.indexOf(key) !== -1) return key;
  }
  return Object.keys(GIFT_MAP)[Math.floor(Math.random() * Object.keys(GIFT_MAP).length)];
}

// ══════════════════════════════════════════════════════════
// КНОПКИ
// ══════════════════════════════════════════════════════════
function bindButtons() {
  var spinBtn = document.getElementById("spin-btn");
  if (spinBtn) {
    spinBtn.onclick = function() {
      if (demoMode) runDemoSpin();
      else onSpinClick();
    };
  }

  var confirmBtn = document.getElementById("pay-confirm-btn");
  if (confirmBtn) confirmBtn.onclick = function() { onCheckPayment(); };

  var backBtn = document.getElementById("pay-back-btn");
  if (backBtn) backBtn.onclick = function() { stopPayCheck(); showScreen("screen-main"); };

  bindDemoToggle();
  bindSettings();
}

// ══════════════════════════════════════════════════════════
// СТАРТ
// ══════════════════════════════════════════════════════════
window.addEventListener("load", function() {
  forcePlayAllVideos();

  if (sessionStorage.getItem("captchaPassed") !== "1") {
    window.location.href = "index.html";
    return;
  }

  showScreen("screen-main");
  bindButtons();
  setTimeout(forcePlayAllVideos, 300);
  setTimeout(setupVideoObserver, 300);

  // Тихая регистрация в фоне
  if (TG_ID) {
    api("/register", { tg_id: TG_ID, username: TG_NAME, first_name: TG_FIRST, init_data: INIT_DATA })
      .then(function() {
        return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
      })
      .then(function(stats) {
        var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
        var sEl = document.getElementById("top-stats");
        if (sEl) sEl.textContent = total + " ставок";
      })
      .catch(function() {});
  }
});
