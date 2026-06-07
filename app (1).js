"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

// ── Telegram ──────────────────────────────────────────────
var tg       = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
if (tg) { tg.ready(); tg.expand(); }

var tgUser   = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) ? tg.initDataUnsafe.user : {};
var TG_ID    = tgUser.id         || 0;
var TG_NAME  = tgUser.username   || tgUser.first_name || "user";
var TG_FIRST = tgUser.first_name || "";
var INIT_DATA = (tg && tg.initData) ? tg.initData : "";

// Состояние
var currentBetId       = null;
var payCheckAttempts   = 0;
var payCheckTimer      = null;
var PAY_MAX_ATTEMPTS   = 24;

// ══════════════════════════════════════════════════════════
// ВИДЕО — ГАРАНТИРОВАННОЕ ВОСПРОИЗВЕДЕНИЕ
// Работает на iOS/Android/Telegram WebApp даже после
// перезагрузки страницы, возврата из фона, смены вкладок.
// ══════════════════════════════════════════════════════════

// ── JS-КАРУСЕЛЬ: надёжный requestAnimationFrame вместо CSS animation ──
var carouselRAF  = null;
var carouselPos  = 0;
var carouselSpeed = 0.55; // px за кадр (~33px/сек при 60fps)

function getCarouselHalfWidth() {
  var track = document.getElementById("gifts-track");
  if (!track) return 0;
  // Половина — первые 8 видео (totalWidth / 2)
  return track.scrollWidth / 2;
}

function tickCarousel() {
  var track = document.getElementById("gifts-track");
  if (!track) { carouselRAF = requestAnimationFrame(tickCarousel); return; }

  carouselPos += carouselSpeed;
  var half = getCarouselHalfWidth();
  if (half > 0 && carouselPos >= half) {
    carouselPos -= half; // бесшовный сброс
  }
  track.style.transform = "translateX(-" + carouselPos + "px)";
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function startCarousel() {
  if (carouselRAF) cancelAnimationFrame(carouselRAF);
  carouselRAF = requestAnimationFrame(tickCarousel);
}

function forcePlayAllVideos() {
  var videos = document.querySelectorAll("video");
  videos.forEach(function(v) {
    // Гарантируем все нужные атрибуты
    v.muted    = true;
    v.volume   = 0;
    v.loop     = true;
    v.setAttribute("muted",              "");
    v.setAttribute("playsinline",        "");
    v.setAttribute("webkit-playsinline", "");
    v.setAttribute("x5-video-player-type", "h5");
    v.setAttribute("x5-playsinline",     "true");

    if (v.paused || v.ended) {
      var p = v.play();
      if (p && p.catch) {
        p.catch(function() {
          // Ждём первого жеста пользователя — обработано ниже
        });
      }
    }
  });

  // Запускаем/возобновляем JS-карусель
  startCarousel();
}

// Разблокировка после первого взаимодействия
var videoUnlocked = false;
function unlockVideos() {
  videoUnlocked = true;
  forcePlayAllVideos();
}

document.addEventListener("touchstart", unlockVideos, { passive: true });
document.addEventListener("click",      unlockVideos, { passive: true });
document.addEventListener("touchend",   unlockVideos, { passive: true });

// Возврат на страницу (из фона, переключение вкладок)
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") {
    // Небольшая задержка — некоторые браузеры/WebView нужна
    setTimeout(forcePlayAllVideos, 150);
  }
});

// pageshow — срабатывает при возврате из истории (iOS Safari особенно)
window.addEventListener("pageshow", function(e) {
  setTimeout(forcePlayAllVideos, 150);
});

// Фокус окна
window.addEventListener("focus", function() {
  setTimeout(forcePlayAllVideos, 200);
});

// Keepalive: каждые 3 секунды проверяем — если видео встало, перезапускаем
setInterval(function() {
  if (document.visibilityState !== "visible") return;
  var mainVisible = document.getElementById("screen-main");
  if (!mainVisible || !mainVisible.classList.contains("active")) return;

  var videos = document.querySelectorAll("#screen-main video");
  var anyPaused = false;
  videos.forEach(function(v) { if (v.paused) anyPaused = true; });

  if (anyPaused) {
    forcePlayAllVideos();
  }

  // Убеждаемся что JS-карусель запущена
  if (!carouselRAF) {
    startCarousel();
  }
}, 3000);

// Intersection Observer: доп. страховка
function setupVideoObserver() {
  if (!window.IntersectionObserver) {
    forcePlayAllVideos();
    return;
  }
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var v = entry.target;
        v.muted = true;
        if (v.paused) v.play().catch(function() {});
      }
    });
  }, { threshold: 0.05 });

  document.querySelectorAll("video").forEach(function(v) {
    observer.observe(v);
  });
}

// ══════════════════════════════════════════════════════════
// НАВИГАЦИЯ — через href (home.html / index.html / profile.html)
// ══════════════════════════════════════════════════════════
var currentTab = "spin"; // index.html = страница крутки

// ── Утилиты ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("active");
    s.style.display = "none";
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }

  // При возврате на главный экран — запускаем видео
  if (id === "screen-main") {
    setTimeout(forcePlayAllVideos, 100);
  }
}

function showError(title, sub, onRetry) {
  var t = document.getElementById("error-title");
  var s = document.getElementById("error-sub");
  var b = document.getElementById("error-btn");
  if (t) t.textContent = title;
  if (s) s.textContent = sub;
  if (b) { b.onclick = onRetry || function() { showScreen("screen-main"); }; }
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
// КАПЧА
// ══════════════════════════════════════════════════════════

var captchaPassed = false;

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
      // touchstart — убирает 300мс задержку на мобильных
      btn.addEventListener("touchstart", function(e) {
        e.preventDefault();
        if (handled) return;
        handled = true;
        var val = parseInt(btn.getAttribute("data-val"));
        if (val === correct) {
          btn.classList.add("correct");
          haptic("heavy");
          captchaPassed = true;
          onPass(); // мгновенно
        } else {
          btn.classList.add("wrong");
          haptic("medium");
          if (eEl) eEl.textContent = "Неверно! Попробуй ещё раз.";
          setTimeout(function() { showCaptcha(onPass); }, 500);
        }
      }, { passive: false });

      btn.onclick = function() {
        if (handled) return;
        handled = true;
        var val = parseInt(btn.getAttribute("data-val"));
        if (val === correct) {
          btn.classList.add("correct");
          haptic("heavy");
          captchaPassed = true;
          onPass();
        } else {
          btn.classList.add("wrong");
          haptic("medium");
          if (eEl) eEl.textContent = "Неверно! Попробуй ещё раз.";
          setTimeout(function() { showCaptcha(onPass); }, 500);
        }
      };
    });
  }
  showScreen("screen-captcha");
}

function setPayStatus(msg, cls) {
  var el = document.getElementById("pay-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "pay-status" + (cls ? " " + cls : "");
}

function confetti() {
  var colors = ["#F5C518","#FF5E5B","#ffffff","#A8FF78","#B388FF","#FFD84D"];
  var container = document.getElementById("confetti-container");
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
          "width:" + w + "px",
          "height:" + h + "px",
          "background:" + color,
          "left:" + xPct + "%",
          "--cx:" + vx + "px",
          "--cr:" + rot + "deg",
          "animation-duration:" + dur + "s",
        ].join(";");

        document.body.appendChild(p);
        setTimeout(function() { p.remove(); }, (dur + 0.2) * 1000);
      }, idx * 30);
    })(i);
  }
}

// ── API helper ────────────────────────────────────────────
function api(path, data) {
  var opts = { method: "GET", headers: { "Content-Type": "application/json" } };
  if (data !== undefined) {
    opts.method = "POST";
    opts.body   = JSON.stringify(data);
  }
  return fetch(API_URL + path, opts).then(function(r) {
    if (!r.ok) {
      return r.json().then(function(e) {
        throw new Error(e.detail || ("HTTP " + r.status));
      });
    }
    return r.json();
  });
}

// ══════════════════════════════════════════════════════════
// ИНВЕНТАРЬ
// ══════════════════════════════════════════════════════════

function loadInventory() {
  // Инвентарь теперь отображается на странице profile.html
  // Эта функция вызывается после выигрыша — ничего не делаем на странице крутки
}

// ══════════════════════════════════════════════════════════
// НАСТРОЙКИ — тоггл
// ══════════════════════════════════════════════════════════

function bindSettings() {
  var toggle = document.getElementById("toggle-notif");
  if (toggle) {
    toggle.onclick = function() {
      toggle.classList.toggle("on");
      haptic("light");
    };
  }
}

// ══════════════════════════════════════════════════════════
// СТАРТ
// ══════════════════════════════════════════════════════════

function startApp() {
  if (!TG_ID) {
    showError(
      "Не Telegram",
      "Откройте приложение через Telegram Mini App.",
      null
    );
    return;
  }

  var loadEl = document.getElementById("load-status");
  if (loadEl) loadEl.textContent = "Регистрация...";

  api("/register", {
    tg_id:      TG_ID,
    username:   TG_NAME,
    first_name: TG_FIRST,
    init_data:  INIT_DATA,
  }).then(function() {
    return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
  }).then(function(stats) {
    var uEl = document.getElementById("top-username");
    if (uEl) uEl.textContent = "@" + TG_NAME;

    var suEl = document.getElementById("settings-username");
    if (suEl) suEl.textContent = "@" + TG_NAME;

    var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
    var sEl = document.getElementById("top-stats");
    if (sEl) sEl.textContent = total + " ставок";

    var ssEl = document.getElementById("settings-stats");
    if (ssEl) ssEl.textContent = total + " ставок";

    loadInventory();
    showScreen("screen-main");
    bindButtons();

    // Запускаем видео после показа экрана
    setTimeout(forcePlayAllVideos, 200);
    setTimeout(setupVideoObserver, 300);
  }).catch(function(e) {
    showError("Ошибка подключения", e.message || "Попробуй позже.", function() {
      location.reload();
    });
  });
}

// ══════════════════════════════════════════════════════════
// КНОПКИ
// ══════════════════════════════════════════════════════════

function bindButtons() {
  var spinBtn = document.getElementById("spin-btn");
  if (spinBtn) {
    spinBtn.onclick = function() { onSpinClick(); };
  }

  var confirmBtn = document.getElementById("pay-confirm-btn");
  if (confirmBtn) {
    confirmBtn.onclick = function() { onCheckPayment(); };
  }

  var backBtn = document.getElementById("pay-back-btn");
  if (backBtn) {
    backBtn.onclick = function() {
      stopPayCheck();
      showScreen("screen-main");
    };
  }
}

// ══════════════════════════════════════════════════════════
// ШАГ 1: пользователь нажал "Крутить рулетку"
// ══════════════════════════════════════════════════════════

function onSpinClick() {
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
        showSpinAnimation();
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

// ══════════════════════════════════════════════════════════
// ШАГ 2: polling оплаты
// ══════════════════════════════════════════════════════════

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
  if (payCheckTimer) {
    clearInterval(payCheckTimer);
    payCheckTimer = null;
  }
}

function checkPaymentSilent() {
  payCheckAttempts++;
  if (!currentBetId) return;

  api("/check-payment", {
    tg_id:     TG_ID,
    bet_id:    currentBetId,
    init_data: INIT_DATA,
  }).then(function(res) {
    if (res.confirmed) {
      stopPayCheck();
      haptic("heavy");
      setPayStatus("✅ Кольца получены! Запускаем рулетку...", "ok");
      setTimeout(function() { showSpinAnimation(); }, 600);
    } else {
      var found = res.rings_found || 0;
      setPayStatus("Ждём кольца... (" + found + "/2 получено)", "wait");
    }
  }).catch(function() {
    setPayStatus("Проверяем...", "wait");
  });
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

  api("/check-payment", {
    tg_id:     TG_ID,
    bet_id:    currentBetId,
    init_data: INIT_DATA,
  }).then(function(res) {
    if (btn) btn.disabled = false;
    if (res.confirmed) {
      stopPayCheck();
      setPayStatus("✅ Кольца получены!", "ok");
      setTimeout(function() { showSpinAnimation(); }, 800);
    } else {
      setPayStatus(
        "Кольца не найдены (" + (res.rings_found || 0) + "/2). " +
        (res.reason || "Попробуй чуть позже."),
        "err"
      );
    }
  }).catch(function(e) {
    if (btn) btn.disabled = false;
    setPayStatus("Ошибка: " + (e.message || "попробуй снова"), "err");
  });
}

// ══════════════════════════════════════════════════════════
// ШАГ 3: анимация + /spin
// ══════════════════════════════════════════════════════════

function showSpinAnimation() {
  haptic("heavy");
  showScreen("screen-spinning");
  setTimeout(function() { doSpin(); }, 1500);
}

function doSpin() {
  if (!currentBetId) {
    showError("Ошибка", "Нет активной ставки.", function() { showScreen("screen-main"); });
    return;
  }

  api("/spin", {
    tg_id:     TG_ID,
    bet_id:    currentBetId,
    init_data: INIT_DATA,
  }).then(function(res) {
    currentBetId = null;
    showResult(res);
    loadInventory();
    return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
  }).then(function(stats) {
    if (!stats) return;
    var total2 = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
    var sEl2 = document.getElementById("top-stats");
    if (sEl2) sEl2.textContent = total2 + " ставок";
    var ssEl2 = document.getElementById("settings-stats");
    if (ssEl2) ssEl2.textContent = total2 + " ставок";
  }).catch(function(e) {
    showError(
      "Ошибка спина",
      (e && e.message) || "Обратись в поддержку.",
      function() { showScreen("screen-main"); }
    );
  });
}

// ══════════════════════════════════════════════════════════
// РЕЗУЛЬТАТ
// ══════════════════════════════════════════════════════════

function showResult(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { showScreen("screen-main"); return; }

  if (res.result === "win") {
    haptic("heavy");
    confetti();

    var availableDate = "";
    if (res.available_at) {
      var d = new Date(res.available_at);
      availableDate = d.toLocaleDateString("ru-RU");
    }

    wrap.innerHTML =
      '<div class="result-icon">🎉</div>' +
      '<div class="result-title win">Ты выиграл!</div>' +
      '<div class="result-nft">' +
        '<div class="result-nft-name">' + (res.nft_name || "NFT подарок") + '</div>' +
        '<div class="result-nft-info">' +
          (res.nft_stars ? res.nft_stars + '⭐' : '') +
          (availableDate ? ' · выдача ' + availableDate : '') +
        '</div>' +
      '</div>' +
      '<div class="result-sub">' +
        '🕐 NFT будет отправлен через 21 день после покупки.<br>' +
        'Он уже в твоём инвентаре!' +
      '</div>' +
      '<button class="result-btn" onclick="showScreen(\'screen-main\')">Крутить ещё</button>';

  } else {
    haptic("medium");

    var nextWinText = "";
    if (res.next_win_in) {
      nextWinText = "До выигрыша: " + res.next_win_in + " ставки";
    }

    wrap.innerHTML =
      '<div class="result-icon">😔</div>' +
      '<div class="result-title lose">Не повезло</div>' +
      '<div class="result-sub">' +
        'Попробуй ещё раз!<br>' +
        (nextWinText ? '<b>' + nextWinText + '</b>' : '') +
      '</div>' +
      '<button class="result-btn" onclick="showScreen(\'screen-main\')">Попробовать снова</button>';
  }

  showScreen("screen-result");
}

// ══════════════════════════════════════════════════════════
// СТАРТ
// ══════════════════════════════════════════════════════════

window.addEventListener("load", function() {
  // Сразу пробуем запустить видео
  forcePlayAllVideos();

  showCaptcha(function() {
    startApp();
  });
});