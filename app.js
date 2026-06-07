"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ
// ══════════════════════════════════════════════════════════
var API_URL = "https://backend-9iys.onrender.com";

var tg       = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
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
// ВИДЕО — ГАРАНТИРОВАННОЕ ВОСПРОИЗВЕДЕНИЕ
// ══════════════════════════════════════════════════════════

function forcePlayAllVideos() {
  var videos = document.querySelectorAll("video");
  videos.forEach(function(v) {
    v.muted  = true;
    v.volume = 0;
    v.loop   = true;
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.setAttribute("x5-video-player-type", "h5");
    v.setAttribute("x5-playsinline", "true");
    if (v.paused || v.ended) {
      var p = v.play();
      if (p && p.catch) p.catch(function() {});
    }
  });
  var track = document.getElementById("gifts-track");
  if (track) track.style.animationPlayState = "running";
}

document.addEventListener("touchstart", forcePlayAllVideos, { passive: true });
document.addEventListener("click",      forcePlayAllVideos, { passive: true });

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") setTimeout(forcePlayAllVideos, 100);
});
window.addEventListener("pageshow",   function() { setTimeout(forcePlayAllVideos, 100); });
window.addEventListener("focus",      function() { setTimeout(forcePlayAllVideos, 150); });

setInterval(function() {
  if (document.visibilityState !== "visible") return;
  var main = document.getElementById("screen-main");
  if (!main || !main.classList.contains("active")) return;
  var anyPaused = false;
  document.querySelectorAll("#screen-main video").forEach(function(v) {
    if (v.paused) anyPaused = true;
  });
  if (anyPaused) forcePlayAllVideos();
  var track = document.getElementById("gifts-track");
  if (track && track.style.animationPlayState === "paused")
    track.style.animationPlayState = "running";
}, 3000);

function setupVideoObserver() {
  if (!window.IntersectionObserver) { forcePlayAllVideos(); return; }
  var obs = new IntersectionObserver(function(entries) {
    entries.forEach(function(e) {
      if (e.isIntersecting) {
        var v = e.target; v.muted = true;
        if (v.paused) v.play().catch(function() {});
      }
    });
  }, { threshold: 0.05 });
  document.querySelectorAll("video").forEach(function(v) { obs.observe(v); });
}

// ══════════════════════════════════════════════════════════
// НАВИГАЦИЯ
// ══════════════════════════════════════════════════════════

var currentTab = "home";

window.switchTab = function(tab) {
  currentTab = tab;

  document.querySelectorAll(".tab-pane").forEach(function(p) { p.classList.remove("active"); });
  var pane = document.getElementById("tab-" + tab);
  if (pane) pane.classList.add("active");

  document.querySelectorAll(".nav-tab").forEach(function(b) { b.classList.remove("active"); });
  var navBtn = document.getElementById("nav-" + tab);
  if (navBtn) navBtn.classList.add("active");

  var panel = document.getElementById("side-panel");
  if (panel) panel.style.display = (tab === "home") ? "none" : "block";
};

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("active");
    s.style.display = "none";
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }
  if (id === "screen-main") setTimeout(forcePlayAllVideos, 80);
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

// ══════════════════════════════════════════════════════════
// КАПЧА — мгновенный переход, без задержки
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
  if (!oEl) return;

  oEl.innerHTML = options.map(function(v) {
    return '<button class="captcha-btn" data-val="' + v + '">' + v + '</button>';
  }).join("");

  var handled = false;

  function handleAnswer(btn) {
    if (handled) return;
    handled = true;
    var val = parseInt(btn.getAttribute("data-val"));
    if (val === correct) {
      btn.classList.add("correct");
      haptic("heavy");
      captchaPassed = true;
      // МГНОВЕННО — без setTimeout
      onPass();
    } else {
      btn.classList.add("wrong");
      haptic("medium");
      if (eEl) eEl.textContent = "Неверно! Попробуй ещё раз.";
      setTimeout(function() { showCaptcha(onPass); }, 400);
    }
  }

  oEl.querySelectorAll(".captcha-btn").forEach(function(btn) {
    // touchend — мгновенное срабатывание без 300мс задержки iOS
    btn.addEventListener("touchend", function(e) {
      e.preventDefault();
      handleAnswer(btn);
    }, { passive: false });
    btn.addEventListener("click", function() {
      handleAnswer(btn);
    });
  });

  showScreen("screen-captcha");
}

// ══════════════════════════════════════════════════════════
// ОПЛАТА
// ══════════════════════════════════════════════════════════

function setPayStatus(msg, cls) {
  var el = document.getElementById("pay-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "pay-status" + (cls ? " " + cls : "");
}

function confetti() {
  var colors = ["#F5C518","#FF5E5B","#ffffff","#A8FF78","#B388FF","#FFD84D"];
  for (var i = 0; i < 60; i++) {
    (function(idx) {
      setTimeout(function() {
        var p = document.createElement("div");
        p.className = "confetti-p";
        var fromRight = idx >= 30;
        var color = colors[Math.floor(Math.random() * colors.length)];
        var w = 7 + Math.random() * 8;
        var h = 10 + Math.random() * 12;
        var dur = 1.4 + Math.random() * 0.9;
        var rot = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
        var xPct = fromRight ? (80 + Math.random() * 20) : (Math.random() * 20);
        var vx = fromRight ? -(30 + Math.random() * 80) : (30 + Math.random() * 80);
        p.style.cssText = [
          "width:" + w + "px", "height:" + h + "px",
          "background:" + color, "left:" + xPct + "%",
          "--cx:" + vx + "px", "--cr:" + rot + "deg",
          "animation-duration:" + dur + "s",
        ].join(";");
        document.body.appendChild(p);
        setTimeout(function() { p.remove(); }, (dur + 0.2) * 1000);
      }, idx * 25);
    })(i);
  }
}

function api(path, data) {
  var opts = { method: "GET", headers: { "Content-Type": "application/json" } };
  if (data !== undefined) { opts.method = "POST"; opts.body = JSON.stringify(data); }
  return fetch(API_URL + path, opts).then(function(r) {
    if (!r.ok) return r.json().then(function(e) { throw new Error(e.detail || ("HTTP " + r.status)); });
    return r.json();
  });
}

// ══════════════════════════════════════════════════════════
// ИНВЕНТАРЬ
// ══════════════════════════════════════════════════════════

function loadInventory() {
  if (!TG_ID) return;
  api("/inventory/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA))
    .then(function(res) {
      var block = document.getElementById("inv-block");
      var list  = document.getElementById("inv-list");
      if (!res.items || res.items.length === 0) {
        if (block) block.style.display = "none"; return;
      }
      if (block) block.style.display = "block";
      if (list) {
        list.innerHTML = res.items.map(function(it) {
          var statusLabel = {
            "waiting":        "⏳ Ждём 21 день до выдачи",
            "delivered":      "✅ Выдан",
            "transfer_error": "❌ Ошибка выдачи — напиши в поддержку",
            "manual":         "🔧 Обрабатывается администратором",
          }[it.status] || it.status;
          var dateStr = "";
          if (it.available_at) {
            var d = new Date(it.available_at);
            dateStr = " · выдача " + d.toLocaleDateString("ru-RU");
          }
          return '<div class="inv-item">' +
            '<div class="inv-item-name">' + (it.nft_name || "NFT") + '</div>' +
            '<div class="inv-item-stars">' + (it.nft_stars || "—") + '⭐' + dateStr + '</div>' +
            '<div class="inv-item-status">' + statusLabel + '</div>' +
            '</div>';
        }).join("");
      }
    }).catch(function() {});
}

// ══════════════════════════════════════════════════════════
// НАСТРОЙКИ
// ══════════════════════════════════════════════════════════

function bindSettings() {
  var toggle = document.getElementById("toggle-notif");
  if (toggle) {
    toggle.onclick = function() { toggle.classList.toggle("on"); haptic("light"); };
  }
}

// ══════════════════════════════════════════════════════════
// СТАРТ
// ══════════════════════════════════════════════════════════

function startApp() {
  if (!TG_ID) {
    showError("Не Telegram", "Откройте приложение через Telegram Mini App.", null);
    return;
  }
  var loadEl = document.getElementById("load-status");
  if (loadEl) loadEl.textContent = "Регистрация...";

  api("/register", {
    tg_id: TG_ID, username: TG_NAME, first_name: TG_FIRST, init_data: INIT_DATA,
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
    bindSettings();
    setTimeout(forcePlayAllVideos, 150);
    setTimeout(setupVideoObserver, 250);
  }).catch(function(e) {
    showError("Ошибка подключения", e.message || "Попробуй позже.", function() { location.reload(); });
  });
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
  if (backBtn) backBtn.onclick = function() { stopPayCheck(); showScreen("screen-main"); };
}

function onSpinClick() {
  var btn = document.getElementById("spin-btn");
  if (btn) btn.disabled = true;
  haptic("medium");
  api("/create-bet", { tg_id: TG_ID, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = res.bet_id;
      var acEl  = document.getElementById("ring-account");
      var alEl  = document.getElementById("ring-account-link");
      var hEl   = document.getElementById("hint-account");
      var bidEl = document.getElementById("pay-bet-id");
      if (acEl)  acEl.textContent  = res.ring_account || "@kinub";
      if (alEl)  alEl.textContent  = res.ring_account || "@kinub";
      if (hEl)   hEl.textContent   = res.ring_account || "@kinub";
      if (bidEl) bidEl.textContent = res.bet_id;
      setPayStatus("", "");
      payCheckAttempts = 0;
      if (res.bet_status === "paid") { showSpinAnimation(); return; }
      showScreen("screen-pay");
      if (btn) btn.disabled = false;
      startAutoPayCheck();
    }).catch(function(e) {
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
        stopPayCheck(); haptic("heavy");
        setPayStatus("✅ Кольца получены! Запускаем рулетку...", "ok");
        setTimeout(function() { showSpinAnimation(); }, 500);
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
    if (btn) btn.disabled = false; return;
  }
  api("/check-payment", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      if (btn) btn.disabled = false;
      if (res.confirmed) {
        stopPayCheck();
        setPayStatus("✅ Кольца получены!", "ok");
        setTimeout(function() { showSpinAnimation(); }, 600);
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
    showError("Ошибка", "Нет активной ставки.", function() { showScreen("screen-main"); }); return;
  }
  api("/spin", { tg_id: TG_ID, bet_id: currentBetId, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = null;
      showResult(res);
      loadInventory();
      return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
    }).then(function(stats) {
      if (!stats) return;
      var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
      var sEl = document.getElementById("top-stats");
      if (sEl) sEl.textContent = total + " ставок";
      var ssEl = document.getElementById("settings-stats");
      if (ssEl) ssEl.textContent = total + " ставок";
    }).catch(function(e) {
      showError("Ошибка спина", (e && e.message) || "Обратись в поддержку.", function() { showScreen("screen-main"); });
    });
}

function showResult(res) {
  var wrap = document.getElementById("result-wrap");
  if (!wrap) { showScreen("screen-main"); return; }
  if (res.result === "win") {
    haptic("heavy"); confetti();
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
        '<div class="result-nft-info">' + (res.nft_stars ? res.nft_stars + "⭐" : "") + (availableDate ? " · выдача " + availableDate : "") + '</div>' +
      '</div>' +
      '<div class="result-sub">🕐 NFT будет отправлен через 21 день после покупки.<br>Он уже в твоём инвентаре!</div>' +
      '<button class="cta-btn" onclick="showScreen(\'screen-main\')">Крутить ещё</button>';
  } else {
    haptic("medium");
    var nextWinText = res.next_win_in ? "До выигрыша: " + res.next_win_in + " ставки" : "";
    wrap.innerHTML =
      '<div class="result-icon">😔</div>' +
      '<div class="result-title lose">Не повезло</div>' +
      '<div class="result-sub">Попробуй ещё раз!<br>' + (nextWinText ? "<b>" + nextWinText + "</b>" : "") + '</div>' +
      '<button class="cta-btn" onclick="showScreen(\'screen-main\')">Попробовать снова</button>';
  }
  showScreen("screen-result");
}

// ══════════════════════════════════════════════════════════
// ИНИТ
// ══════════════════════════════════════════════════════════

window.addEventListener("load", function() {
  forcePlayAllVideos();
  showCaptcha(function() {
    startApp();
  });
});