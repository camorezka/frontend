"use strict";

// ══════════════════════════════════════════════════════════
// КОНФИГ — замени на свой URL Render сервиса
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
var PAY_MAX_ATTEMPTS   = 24; // 24 × 5 сек = 120 сек

// ── Утилиты ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(function(s) {
    s.classList.remove("active");
    s.style.display = "none";
  });
  var el = document.getElementById(id);
  if (el) { el.style.display = "flex"; el.classList.add("active"); }
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

  // Генерируем 3 неправильных варианта
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

    oEl.querySelectorAll(".captcha-btn").forEach(function(btn) {
      btn.onclick = function() {
        var val = parseInt(btn.getAttribute("data-val"));
        if (val === correct) {
          btn.classList.add("correct");
          haptic("heavy");
          captchaPassed = true;
          setTimeout(function() { onPass(); }, 400);
        } else {
          btn.classList.add("wrong");
          haptic("medium");
          if (eEl) eEl.textContent = "Неверно! Попробуй ещё раз.";
          setTimeout(function() {
            btn.classList.remove("wrong");
            if (eEl) eEl.textContent = "";
          }, 800);
          // Генерируем новую капчу через секунду
          setTimeout(function() { showCaptcha(onPass); }, 900);
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
  var colors = ["#F5C518","#FF5E5B","#00D2FF","#A8FF78","#B388FF","#FFD84D"];
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
// ОБНОВЛЕНИЕ АЛГОРИТМ-БЛОКА
// Показываем сколько ставок до выигрыша.
// Для первого цикла (winning_spin=3) показываем фиксированную схему.
// Для последующих — скрываем winning_spin (это рандом, пользователь не знает).
// ══════════════════════════════════════════════════════════

function renderAlgoBlock(cycleSpin, winningSpinKnown, totalCycles) {
  var stepsEl  = document.getElementById("algo-steps");
  var noteEl   = document.getElementById("algo-note");
  if (!stepsEl) return;

  var isFirstCycle = (totalCycles === 0);

  if (isFirstCycle) {
    // Первый цикл: winning_spin = 3, показываем явно
    stepsEl.innerHTML = [
      makeStep(1, "lose", "Проигрыш", "2 💍", cycleSpin),
      makeStep(2, "lose", "Проигрыш", "2 💍", cycleSpin),
      makeStep(3, "win",  "🎁 NFT выигрыш!", "300–400⭐", cycleSpin),
    ].join("");
    noteEl.innerHTML =
      'Первый выигрыш гарантированно на <b>3-й ставке</b> · NFT хранится 21 день до выдачи';
  } else {
    // Последующие циклы: winning_spin рандомный (3, 4 или 5), не раскрываем
    var steps = [];
    for (var i = 1; i <= 5; i++) {
      if (i <= 2) {
        steps.push(makeStep(i, "lose", "Проигрыш", "2 💍", cycleSpin));
      } else {
        steps.push(makeStep(i, "win", "🎁 Возможный выигрыш", "NFT", cycleSpin));
        // Показываем до 5 (максимум winning_spin), остальное скрываем
        // — но не раскрываем точный winning_spin
        if (i === 5) break;
      }
    }
    stepsEl.innerHTML = steps.join("");
    noteEl.innerHTML  = 'Выигрышная ставка — рандом (3, 4 или 5) · NFT хранится 21 день';
  }
}

function makeStep(num, type, label, tag, activeSpin) {
  var extraClass = (num === activeSpin + 1) ? " active-spin" : "";
  return '<div class="algo-step ' + type + extraClass + '">' +
    '<span class="algo-num">' + num + '</span>' +
    '<span>' + label + '</span>' +
    '<span class="algo-tag' + (type === "win" ? " win-tag" : "") + '">' + tag + '</span>' +
    '</div>';
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
        if (block) block.style.display = "none";
        return;
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
            '<div class="inv-item-status ' + it.status + '">' + statusLabel + '</div>' +
            '</div>';
        }).join("");
      }
    })
    .catch(function(e) {
      // Инвентарь необязательный, молча игнорируем
    });
}

// ══════════════════════════════════════════════════════════
// СТАРТ ПРИЛОЖЕНИЯ
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
    // Обновляем UI
    var uEl = document.getElementById("top-username");
    var sEl = document.getElementById("top-stats");
    if (uEl) uEl.textContent = "@" + TG_NAME;
    if (sEl) {
      var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
      sEl.textContent = total + " ставок · цикл " + (stats.total_cycles + 1);
    }

    renderAlgoBlock(
      stats.cycle_spin    || 0,
      stats.winning_spin  || 3,
      stats.total_cycles  || 0
    );

    var hintEl = document.getElementById("next-win-hint");
    if (hintEl && stats.next_win_in) {
      hintEl.textContent = "До выигрыша: " + stats.next_win_in + " ставки";
    }

    loadInventory();
    showScreen("screen-main");
    bindButtons();
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
// → создаём ставку → показываем инструкцию с кольцами
// ══════════════════════════════════════════════════════════

function onSpinClick() {
  var btn = document.getElementById("spin-btn");
  if (btn) btn.disabled = true;
  haptic("medium");

  api("/create-bet", { tg_id: TG_ID, init_data: INIT_DATA })
    .then(function(res) {
      currentBetId = res.bet_id;

      // Обновляем инструкцию
      var acEl  = document.getElementById("ring-account");
      var alEl  = document.getElementById("ring-account-link");
      var bidEl = document.getElementById("pay-bet-id");
      if (acEl)  acEl.textContent  = res.ring_account || "@kinub";
      if (alEl)  alEl.textContent  = res.ring_account || "@kinub";
      if (bidEl) bidEl.textContent = res.bet_id;

      setPayStatus("", "");
      payCheckAttempts = 0;

      // Если ставка уже была в статусе paid — пропускаем экран оплаты
      if (res.bet_status === "paid") {
        showSpinAnimation();
        return;
      }

      showScreen("screen-pay");
      if (btn) btn.disabled = false;

      // Автопроверка каждые 5 сек
      startAutoPayCheck();
    })
    .catch(function(e) {
      if (btn) btn.disabled = false;
      toast("Ошибка: " + (e.message || "попробуй снова"));
    });
}

// ══════════════════════════════════════════════════════════
// ШАГ 2: проверяем получение колец (polling)
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
      // Автоматически запускаем рулетку без нажатия кнопки
      setTimeout(function() { showSpinAnimation(); }, 600);
    } else {
      var found = res.rings_found || 0;
      setPayStatus("Ждём кольца... (" + found + "/2 получено)", "wait");
    }
  }).catch(function(e) {
    // Ошибка проверки — не останавливаем polling
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
// ШАГ 3: анимация рулетки + запрос /spin
// ══════════════════════════════════════════════════════════

function showSpinAnimation() {
  haptic("heavy");
  showScreen("screen-spinning");

  // Анимация 1.5 сек, потом запрашиваем результат
  setTimeout(function() {
    doSpin();
  }, 1500);
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
    // Обновляем статистику
    return api("/stats/" + TG_ID + "?init_data=" + encodeURIComponent(INIT_DATA));
  }).then(function(stats) {
    if (!stats) return;
    renderAlgoBlock(stats.cycle_spin || 0, stats.winning_spin || 3, stats.total_cycles || 0);
    var hintEl = document.getElementById("next-win-hint");
    if (hintEl && stats.next_win_in) {
      hintEl.textContent = "До выигрыша: " + stats.next_win_in + " ставки";
    }
    var sEl = document.getElementById("top-stats");
    if (sEl) {
      var total = (stats.total_cycles || 0) * 10 + (stats.cycle_spin || 0);
      sEl.textContent = total + " ставок · цикл " + (stats.total_cycles + 1);
    }
  }).catch(function(e) {
    showError(
      "Ошибка спина",
      e.message || "Обратись в поддержку.",
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
  showCaptcha(function() {
    startApp();
  });
});
