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
var carouselSpeed = 2.5;

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
// НАВИГАЦИЯ — переключение вкладок БЕЗ перезагрузки
// ══════════════════════════════════════════════════════════
var tabScreens = {
  home:      "screen-home",
  inventory: "screen-inventory",
  spin:      "screen-spin",
  profile:   "screen-profile",
  settings:  "screen-settings"
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

  // Обновляем активную кнопку во всех нав-барах
  document.querySelectorAll(".nav-tab").forEach(function(btn) {
    btn.classList.remove("active");
  });
  // Активируем кнопки этого таба во всех навбарах
  for (var i = 1; i <= 5; i++) {
    var btn = document.getElementById("navbtn" + (i > 1 ? i : "") + "-" + tab);
    // navbtn-home (первый навбар без цифры), navbtn2-home, etc.
  }
  // Универсальный способ — ищем по onclick
  document.querySelectorAll(".nav-tab").forEach(function(btn) {
    var attr = btn.getAttribute("onclick") || "";
    if (attr.indexOf("'" + tab + "'") !== -1) btn.classList.add("active");
  });

  haptic("light");

  // Доп. действия при переходе
  if (tab === "spin") {
    setTimeout(forcePlayAllVideos, 100);
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
}

// ══════════════════════════════════════════════════════════
// ЭКРАНЫ ВНУТРИ (оплата / спин / результат / ошибка)
// ══════════════════════════════════════════════════════════
var ALL_SCREENS = [
  "screen-loading", "screen-home", "screen-inventory",
  "screen-spin", "screen-profile", "screen-settings",
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
// КАПЧА — один раз при открытии мини-приложения
// ══════════════════════════════════════════════════════════
function showCaptcha(onPass) {
  var a = Math.floor(Math.random() * 9) + 1;
  var b = Math.floor(Math.random() * 9) + 1;
  var correct = a + b;
  var wrong = [];
  while (wrong.length < 3) {
    var w = correct + (Math.floor(Math.random() * 7) - 3);
    if (w !== correct && w > 0 && wrong.indexOf(w) === -1) wrong.push(w);
  }
  var options = [correct].concat(wrong).sort(function() { return Math.random() - 0.5; });

  var qEl = document.getElementById("captcha-question");
  var oEl = document.getElementById("captcha-options");
  var eEl = document.getElementById("captcha-error");
  if (qEl) qEl.textContent = a + " + " + b + " = ?";
  if (eEl) eEl.textContent = "";
  if (oEl) {
    oEl.innerHTML = options.map(function(v) {
      return '<button class="captcha-btn" data-val="' + v + '">' + v + '</button>';
    }).join("");

    var handled = false;
    oEl.querySelectorAll(".captcha-btn").forEach(function(btn) {
      function tryAnswer() {
        if (handled) return;
        handled = true;
        var val = parseInt(btn.getAttribute("data-val"));
        if (val === correct) {
          btn.classList.add("correct");
          haptic("heavy");
          setTimeout(function() {
            var modal = document.getElementById("captcha-modal");
            if (modal) modal.classList.remove("active");
            onPass();
          }, 120);
        } else {
          btn.classList.add("wrong");
          haptic("medium");
          if (eEl) eEl.textContent = "Неверно! Попробуй ещё раз.";
          handled = false;
          setTimeout(function() { showCaptcha(onPass); }, 500);
        }
      }
      btn.addEventListener("touchstart", function(e) { e.preventDefault(); tryAnswer(); }, { passive: false });
      btn.onclick = tryAnswer;
    });
  }

  var modal = document.getElementById("captcha-modal");
  if (modal) modal.classList.add("active");
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

  loadStarsBalance("profile-stars-amount");
  if (!TG_ID) return;
  api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(s) {
      var total = (s.total_cycles || 0) * 10 + (s.cycle_spin || 0);
      var sc = document.getElementById("profile-spins-count");
      var st = document.getElementById("stat-total");
      var sw = document.getElementById("stat-wins");
      if (sc) sc.textContent = total;
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
      var total = (s.total_cycles || 0) * 10 + (s.cycle_spin || 0);
      var ssEl = document.getElementById("settings-stats");
      if (ssEl) ssEl.textContent = total + " ставок";
    }).catch(function() {});
}

// ══════════════════════════════════════════════════════════
// РУЛЕТКА
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
          "width:" + w + "px", "height:" + h + "px",
          "background:" + color, "left:" + xPct + "%",
          "--cx:" + vx + "px", "--cr:" + rot + "deg",
          "animation-duration:" + dur + "s"
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
  showScreen("screen-spinning");
  setTimeout(function() { doSpin(); }, 1500);
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
// КНОПКИ
// ══════════════════════════════════════════════════════════
function bindButtons() {
  var spinBtn = document.getElementById("spin-btn");
  if (spinBtn) spinBtn.onclick = function() { onSpinClick(); };

  var confirmBtn = document.getElementById("pay-confirm-btn");
  if (confirmBtn) confirmBtn.onclick = function() { onCheckPayment(); };

  var backBtn = document.getElementById("pay-back-btn");
  if (backBtn) backBtn.onclick = function() { stopPayCheck(); switchTab("spin"); };

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
function startApp() {
  var loadEl = document.getElementById("load-status");
  if (loadEl) loadEl.textContent = "Регистрация...";

  // Если не Telegram — всё равно показываем (dev-режим)
  if (!TG_ID) {
    showScreen("screen-home");
    // Показываем home (первая вкладка)
    Object.keys(tabScreens).forEach(function(key) {
      var el = document.getElementById(tabScreens[key]);
      if (el) { el.style.display = "none"; el.classList.remove("active"); }
    });
    var homeEl = document.getElementById("screen-home");
    if (homeEl) { homeEl.style.display = "flex"; homeEl.classList.add("active"); }
    bindButtons();
    return;
  }

  api("/register", { tg_id: TG_ID, username: TG_NAME, first_name: TG_FIRST, init_data: INIT_DATA })
    .then(function() {
      return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
    })
    .then(function(stats) {
      // Прячем лоадер, показываем home
      ALL_SCREENS.forEach(function(sid) {
        var s = document.getElementById(sid);
        if (s) { s.style.display = "none"; s.classList.remove("active"); }
      });
      var homeEl = document.getElementById("screen-home");
      if (homeEl) { homeEl.style.display = "flex"; homeEl.classList.add("active"); }
      currentTab = "home";

      bindButtons();
    })
    .catch(function(e) {
      showError("Ошибка подключения", (e && e.message) || "Попробуй позже.", function() { location.reload(); });
    });
}

// ══════════════════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════
window.addEventListener("load", function() {
  forcePlayAllVideos();

  // Капча один раз при открытии мини-приложения
  showCaptcha(function() {
    startApp();
  });

  setTimeout(forcePlayAllVideos, 300);
  setTimeout(forcePlayAllVideos, 800);
});
