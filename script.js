(() => {
  "use strict";

  const LEVELS = {
    easy: { name: "Fácil", clues: 42 },
    medium: { name: "Medio", clues: 34 },
    hard: { name: "Difícil", clues: 27 },
    impossible: { name: "Imposible", clues: 20 },
  };

  const state = {
    level: "easy",
    board: [],          // valores actuales (0 = vacío)
    solution: [],       // solución completa
    given: [],          // celdas originales (boolean)
    notes: [],          // notas por celda (Set)
    selected: -1,       // celda seleccionada (0-80)
    notesMode: false,
    handwritingMode: false,
    errorCount: 0,
    mistakes: new Set(),
    history: [],
    timerInterval: null,
    startTime: null,
    elapsed: 0,
    finished: false,
    paused: false,
    streak: 0,
  };

  const boardEl = document.getElementById("board");
  const timerEl = document.getElementById("timer");
  const errorsEl = document.getElementById("errors");
  const notesCheckbox = document.getElementById("notesMode");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const modalText = document.getElementById("modalText");
  const modalBtn = document.getElementById("modalBtn");
  const numpad = document.querySelector(".numpad");
  const mascotBubble = document.getElementById("mascotBubble");
  const mascotMsg = document.getElementById("mascotMsg");
  const pauseBtn = document.getElementById("pauseBtn");
  const pauseOverlay = document.getElementById("pauseOverlay");
  const resumeBtn = document.getElementById("resumeBtn");
  const themeBtn = document.getElementById("themeBtn");
  const handwritingCheckbox = document.getElementById("handwritingMode");
  const calibrateBtn = document.getElementById("calibrateBtn");
  const drawModal = document.getElementById("drawModal");
  const drawTitle = document.getElementById("drawTitle");
  const drawHint = document.getElementById("drawHint");
  const drawCanvas = document.getElementById("drawCanvas");
  const drawClearBtn = document.getElementById("drawClearBtn");
  const drawSkipBtn = document.getElementById("drawSkipBtn");
  const drawConfirmBtn = document.getElementById("drawConfirmBtn");
  const drawCancelBtn = document.getElementById("drawCancelBtn");

  /* ---------------- Handwriting constants ---------------- */

  const SAMPLES_PER_DIGIT = 2;
  const GRID_SIZE = 14;
  const RECOGNITION_THRESHOLD = 3.0;
  const CALIB_STORAGE_KEY = "sudokuHandwritingSamples";

  let pendingCell = -1;
  let isCalibrating = false;
  let calibSamples = [];
  let calibDigit = 1;
  let calibCount = 0;

  /* ---------------- Theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "light" || savedTheme === "dark") {
    applyTheme(savedTheme);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  } else {
    applyTheme("light");
  }

  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
  });

  /* ---------------- Mascot ---------------- */

  const RANDOM_MESSAGES = [
    "¡Vamos, tú puedes! 💪",
    "¡Cada número cuenta! 🧩",
    "¡No te rindas, ya casi! 🌟",
    "¡Respira y mira la caja! 🧠",
    "¡Tú eres más listo que este sudoku! 😄",
    "¡Sigue así, campeón! 🏆",
    "¡Los errores son parte del juego! 💛",
    "¡Guau! Vas de maravilla 🐾",
  ];

  const CORRECT_MESSAGES = [
    "¡Correcto! 🔥",
    "¡Bien! 💪",
    "¡Perfecto! ✨",
    "¡Exacto! 🎯",
  ];

  const ERROR_MESSAGES = [
    "¡Uy! Mira bien la caja 😅",
    "¡Casi! Piensa de nuevo 🤔",
    "¡No pasa nada, continúa! 💛",
  ];

  let mascotTimer = null;
  let mascotHideTimer = null;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function showMascotMessage(text) {
    mascotMsg.textContent = text;
    mascotBubble.classList.add("visible");
    if (mascotHideTimer) clearTimeout(mascotHideTimer);
    mascotHideTimer = setTimeout(() => {
      mascotBubble.classList.remove("visible");
    }, 4000);
  }

  /* ---------------- Sudoku generation ---------------- */

  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  function candidates(board, r, c) {
    const used = new Set();
    for (let i = 0; i < 9; i++) {
      used.add(board[r][i]);
      used.add(board[i][c]);
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        used.add(board[br + i][bc + j]);
      }
    }
    const result = [];
    for (let n = 1; n <= 9; n++) {
      if (!used.has(n)) result.push(n);
    }
    return result;
  }

  function findBest(board) {
    let best = null;
    let bestLen = 10;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const cands = candidates(board, r, c);
          if (cands.length < bestLen) {
            bestLen = cands.length;
            best = { r, c, cands };
          }
          if (bestLen === 1) return best;
        }
      }
    }
    return best;
  }

  function solve(board) {
    const best = findBest(board);
    if (!best) return true;
    const { r, c, cands } = best;
    for (const n of shuffle(cands)) {
      board[r][c] = n;
      if (solve(board)) return true;
      board[r][c] = 0;
    }
    return false;
  }

  function countSolutions(board, limit = 2) {
    let count = 0;
    const copy = board.map((row) => row.slice());

    function recurse() {
      const best = findBest(copy);
      if (!best) {
        count++;
        return;
      }
      const { r, c, cands } = best;
      for (const n of cands) {
        if (count >= limit) return;
        copy[r][c] = n;
        recurse();
        copy[r][c] = 0;
      }
    }

    recurse();
    return count;
  }

  function generatePuzzle() {
    const solution = Array.from({ length: 9 }, () => Array(9).fill(0));
    solve(solution);

    const puzzle = solution.map((row) => row.slice());
    const cells = shuffle(Array.from({ length: 81 }, (_, i) => i));
    const targetClues = LEVELS[state.level].clues;
    let removed = 0;

    for (const cell of cells) {
      if (removed >= 81 - targetClues) break;
      const r = Math.floor(cell / 9);
      const c = cell % 9;
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle) !== 1) {
        puzzle[r][c] = backup;
      } else {
        removed++;
      }
    }

    return { puzzle, solution };
  }

  /* ---------------- Rendering ---------------- */

  function createBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.index = i;
      cell.addEventListener("click", () => selectCell(i));
      boardEl.appendChild(cell);
    }
  }

  function render() {
    const cells = boardEl.children;
    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const r = Math.floor(i / 9);
      const c = i % 9;
      const value = state.board[r][c];
      const notes = state.notes[i];

      cell.className = "cell";

      if (state.given[r][c]) cell.classList.add("given");
      if (i === state.selected) cell.classList.add("selected");
      if (state.mistakes.has(i)) cell.classList.add("error");

      if (value !== 0) {
        if (!state.given[r][c]) {
          cell.classList.add(
            value === state.solution[r][c] ? "correct" : "error"
          );
        }
        cell.textContent = value;
      } else if (notes.size > 0) {
        const grid = document.createElement("div");
        grid.className = "notes-grid";
        for (let n = 1; n <= 9; n++) {
          const span = document.createElement("span");
          if (notes.has(n)) {
            span.textContent = n;
            span.classList.add("on");
          }
          grid.appendChild(span);
        }
        cell.textContent = "";
        cell.appendChild(grid);
      } else {
        cell.textContent = "";
      }
    }

    // highlight same value + row/col/box of selected
    const selR = Math.floor(state.selected / 9);
    const selC = state.selected % 9;
    const selVal = state.selected >= 0 ? state.board[selR][selC] : 0;
    for (let i = 0; i < 81; i++) {
      const cell = cells[i];
      const r = Math.floor(i / 9);
      const c = i % 9;
      if (state.selected < 0) continue;
      const sameRowColBox =
        r === selR || c === selC || (Math.floor(r / 3) === Math.floor(selR / 3) && Math.floor(c / 3) === Math.floor(selC / 3));
      const sameValue =
        selVal !== 0 && state.board[r][c] === selVal;
      if (sameRowColBox && !cell.classList.contains("selected")) {
        cell.classList.add("highlight");
      }
      if (sameValue) {
        cell.classList.add("same-value");
        cell.classList.remove("highlight");
      }
    }

    errorsEl.textContent = `${state.errorCount}/3`;
  }

  /* ---------------- Interaction ---------------- */

  function selectCell(i) {
    if (state.finished || state.paused) return;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c]) {
      state.selected = i;
      render();
      return;
    }
    if (state.handwritingMode) {
      if (loadSamples().length === 0) {
        showMascotMessage("Primero calibrá tu escritura ✏️");
        startCalibration();
        return;
      }
      pendingCell = i;
      state.selected = i;
      render();
      drawTitle.textContent = "Dibuja el número";
      drawHint.textContent = "Escribí el número y tocá Reconocer";
      openDrawModal();
      return;
    }
    state.selected = state.selected === i ? -1 : i;
    render();
  }

  function placeNumber(n, fromHandwriting = false) {
    if (state.selected < 0 || state.finished || state.paused) return;
    const i = state.selected;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c]) return;

    if (state.notesMode && !fromHandwriting) {
      if (state.board[r][c] !== 0) return;
      const notes = state.notes[i];
      if (notes.has(n)) notes.delete(n);
      else notes.add(n);
      saveState();
      render();
      return;
    }

    if (state.board[r][c] === n) return;

    saveState();
    state.board[r][c] = n;
    state.notes[i].clear();

    if (n !== state.solution[r][c]) {
      state.mistakes.add(i);
      state.errorCount++;
      state.streak = 0;
      if (state.errorCount >= 3) {
        state.finished = true;
        stopTimer();
        showModal("Has perdido", "Cometiste 3 errores. ¡Inténtalo de nuevo!");
        showMascotMessage("¡Ánimo! La próxima lo logras 💛");
      } else {
        showMascotMessage(pick(ERROR_MESSAGES));
      }
    } else {
      state.mistakes.delete(i);
      state.streak++;
      if (state.streak === 1) showMascotMessage(pick(CORRECT_MESSAGES));
      else if (state.streak === 3) showMascotMessage("¡Vas en racha! 🚀");
      else if (state.streak === 5) showMascotMessage("¡Imparable! 🌟");
    }

    if (checkWin()) {
      state.finished = true;
      stopTimer();
      showModal("¡Felicidades!", `Completaste el sudoku en ${formatTime(state.elapsed)}`);
      showMascotMessage("¡INCREÍBLE! Eres una máquina 🎉");
    }

    render();
  }

  function erase() {
    if (state.selected < 0 || state.finished || state.paused) return;
    const i = state.selected;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c] || state.board[r][c] === 0) return;
    saveState();
    state.board[r][c] = 0;
    state.mistakes.delete(i);
    render();
  }

  function hint() {
    if (state.selected < 0 || state.finished || state.paused) return;
    const i = state.selected;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c] || state.board[r][c] === state.solution[r][c]) return;
    saveState();
    state.board[r][c] = state.solution[r][c];
    state.notes[i].clear();
    state.mistakes.delete(i);
    render();
  }

  function undo() {
    if (state.finished || state.paused) return;
    const prev = state.history.pop();
    if (!prev) return;
    state.board = prev.board;
    state.notes = prev.notes;
    state.mistakes = prev.mistakes;
    state.errorCount = prev.errorCount;
    render();
  }

  function saveState() {
    state.history.push({
      board: state.board.map((row) => row.slice()),
      notes: state.notes.map((s) => new Set(s)),
      mistakes: new Set(state.mistakes),
      errorCount: state.errorCount,
    });
    if (state.history.length > 100) state.history.shift();
  }

  /* ---------------- Win check ---------------- */

  function checkWin() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (state.board[r][c] !== state.solution[r][c]) return false;
      }
    }
    return true;
  }

  /* ---------------- Timer ---------------- */

  function startTimer() {
    stopTimer();
    state.startTime = Date.now() - state.elapsed * 1000;
    state.timerInterval = setInterval(() => {
      state.elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      timerEl.textContent = formatTime(state.elapsed);
    }, 1000);
  }

  function stopTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function formatTime(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  /* ---------------- Pause ---------------- */

  function togglePause() {
    if (state.finished) return;
    state.paused = !state.paused;
    pauseOverlay.classList.toggle("hidden", !state.paused);
    pauseBtn.textContent = state.paused ? "▶" : "⏸";
    pauseBtn.setAttribute("aria-label", state.paused ? "Continuar" : "Pausar");
    if (state.paused) {
      stopTimer();
    } else {
      startTimer();
    }
  }

  /* ---------------- Handwriting ---------------- */

  function loadSamples() {
    try {
      const raw = localStorage.getItem(CALIB_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveSamples(samples) {
    localStorage.setItem(CALIB_STORAGE_KEY, JSON.stringify(samples));
  }

  function clearCanvas() {
    const ctx = drawCanvas.getContext("2d");
    ctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }

  function openDrawModal() {
    drawModal.classList.remove("hidden");
    clearCanvas();
    drawSkipBtn.style.display = isCalibrating ? "block" : "none";
  }

  function closeDrawModal() {
    drawModal.classList.add("hidden");
    clearCanvas();
  }

  function updateCalibUI() {
    drawTitle.textContent = `Dibuja el número ${calibDigit}`;
    drawHint.textContent = `Muestra ${calibCount + 1} de ${SAMPLES_PER_DIGIT} — ${calibDigit - 1}/9 listos`;
  }

  function startCalibration() {
    isCalibrating = true;
    pendingCell = -1;
    calibSamples = [];
    calibDigit = 1;
    calibCount = 0;
    updateCalibUI();
    openDrawModal();
  }

  function finishCalibration() {
    saveSamples(calibSamples);
    isCalibrating = false;
    closeDrawModal();
    showMascotMessage("¡Calibración lista! Escribí para jugar ✏️");
  }

  function canvasPoint(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (drawCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (drawCanvas.height / rect.height),
    };
  }

  let drawing = false;
  let lastPoint = null;

  drawCanvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    drawCanvas.setPointerCapture(e.pointerId);
    drawing = true;
    lastPoint = canvasPoint(e);
    const ctx = drawCanvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 18;
    ctx.strokeStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(lastPoint.x + 0.1, lastPoint.y + 0.1);
    ctx.stroke();
  });

  drawCanvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = canvasPoint(e);
    const ctx = drawCanvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPoint = p;
  });

  const endDraw = () => {
    drawing = false;
    lastPoint = null;
  };

  drawCanvas.addEventListener("pointerup", endDraw);
  drawCanvas.addEventListener("pointercancel", endDraw);

  function captureGrid(size = GRID_SIZE) {
    const ctx = drawCanvas.getContext("2d");
    const W = drawCanvas.width;
    const H = drawCanvas.height;
    const data = ctx.getImageData(0, 0, W, H).data;
    const drawn = [];
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 0) {
          drawn.push([x, y]);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!drawn.length) return null;
    const m = 8;
    const w = maxX - minX + 2 * m;
    const h = maxY - minY + 2 * m;
    const grid = new Float64Array(size * size);
    for (const [x, y] of drawn) {
      let gx = Math.floor(((x - minX + m) / w) * size);
      let gy = Math.floor(((y - minY + m) / h) * size);
      if (gx >= size) gx = size - 1;
      if (gy >= size) gy = size - 1;
      grid[gy * size + gx]++;
    }
    let max = 0;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] > max) max = grid[i];
    }
    if (max > 0) {
      for (let i = 0; i < grid.length; i++) grid[i] /= max;
    }
    return Array.from(grid);
  }

  function euclidean(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const d = a[i] - b[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  }

  function recognizeDigit(grid) {
    const samples = loadSamples();
    let best = null;
    let bestDist = Infinity;
    for (const s of samples) {
      const dist = euclidean(grid, s.grid);
      if (dist < bestDist) {
        bestDist = dist;
        best = { digit: s.digit, dist };
      }
    }
    return best;
  }

  function handleDrawConfirm() {
    const grid = captureGrid();
    if (!grid) {
      showMascotMessage("Dibujá el número primero ✏️");
      return;
    }
    if (isCalibrating) {
      calibSamples.push({ digit: calibDigit, grid });
      calibCount++;
      if (calibCount >= SAMPLES_PER_DIGIT) {
        calibDigit++;
        calibCount = 0;
      }
      if (calibDigit > 9) {
        finishCalibration();
        return;
      }
      updateCalibUI();
      clearCanvas();
    } else {
      const res = recognizeDigit(grid);
      if (!res || res.dist > RECOGNITION_THRESHOLD) {
        showMascotMessage("No reconocí el número, probá de nuevo 🤔");
        clearCanvas();
        return;
      }
      state.selected = pendingCell;
      placeNumber(res.digit, true);
      closeDrawModal();
    }
  }

  function handleDrawCancel() {
    if (isCalibrating) {
      isCalibrating = false;
      calibSamples = [];
    }
    pendingCell = -1;
    closeDrawModal();
  }

  drawClearBtn.addEventListener("click", clearCanvas);
  drawSkipBtn.addEventListener("click", () => {
    if (!isCalibrating) return;
    calibDigit++;
    calibCount = 0;
    if (calibDigit > 9) {
      finishCalibration();
      return;
    }
    updateCalibUI();
    clearCanvas();
  });
  drawConfirmBtn.addEventListener("click", handleDrawConfirm);
  drawCancelBtn.addEventListener("click", handleDrawCancel);

  calibrateBtn.addEventListener("click", startCalibration);

  handwritingCheckbox.addEventListener("change", () => {
    state.handwritingMode = handwritingCheckbox.checked;
    if (state.handwritingMode && loadSamples().length === 0) {
      showMascotMessage("Primero calibrá tu escritura ✏️");
      startCalibration();
    }
  });

  /* ---------------- Modal ---------------- */

  function showModal(title, text) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modal.classList.remove("hidden");
  }

  modalBtn.addEventListener("click", newGame);

  /* ---------------- New game ---------------- */

  function newGame() {
    stopTimer();
    const { puzzle, solution } = generatePuzzle();
    state.board = puzzle.map((row) => row.slice());
    state.solution = solution;
    state.given = puzzle.map((row) => row.map((v) => v !== 0));
    state.notes = Array.from({ length: 81 }, () => new Set());
    state.selected = -1;
    state.errorCount = 0;
    state.mistakes = new Set();
    state.history = [];
    state.elapsed = 0;
    state.finished = false;
    state.paused = false;
    state.streak = 0;
    timerEl.textContent = "00:00";
    modal.classList.add("hidden");
    pauseOverlay.classList.add("hidden");
    pauseBtn.textContent = "⏸";
    pauseBtn.setAttribute("aria-label", "Pausar");
    if (mascotTimer) clearInterval(mascotTimer);
    mascotTimer = setInterval(() => {
      if (!state.finished && !state.paused) showMascotMessage(pick(RANDOM_MESSAGES));
    }, 25000);
    render();
    startTimer();
  }

  /* ---------------- Events ---------------- */

  document.getElementById("mascot").addEventListener("click", () => {
    showMascotMessage(pick(RANDOM_MESSAGES));
  });

  document.querySelectorAll(".difficulty-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".difficulty-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.level = btn.dataset.level;
      newGame();
    });
  });

  notesCheckbox.addEventListener("change", () => {
    state.notesMode = notesCheckbox.checked;
  });

  numpad.querySelectorAll(".num-btn").forEach((btn) => {
    btn.addEventListener("click", () => placeNumber(parseInt(btn.dataset.num, 10)));
  });

  document.getElementById("eraseBtn").addEventListener("click", erase);
  document.getElementById("hintBtn").addEventListener("click", hint);
  document.getElementById("undoBtn").addEventListener("click", undo);
  document.getElementById("newBtn").addEventListener("click", newGame);
  pauseBtn.addEventListener("click", togglePause);
  resumeBtn.addEventListener("click", togglePause);

  document.addEventListener("keydown", (e) => {
    if (!drawModal.classList.contains("hidden")) {
      if (e.key === "Escape") handleDrawCancel();
      return;
    }
    if (e.key === "Escape") {
      togglePause();
      return;
    }
    if (state.paused) return;
    if (state.selected < 0) return;
    if (e.key >= "1" && e.key <= "9") {
      placeNumber(parseInt(e.key, 10));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      erase();
    } else if (e.key.toLowerCase() === "n") {
      notesCheckbox.checked = !notesCheckbox.checked;
      state.notesMode = notesCheckbox.checked;
    } else if (e.key.toLowerCase() === "h") {
      hint();
    } else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    } else if (e.key === "ArrowUp") moveSelection(-9);
    else if (e.key === "ArrowDown") moveSelection(9);
    else if (e.key === "ArrowLeft") moveSelection(-1);
    else if (e.key === "ArrowRight") moveSelection(1);
  });

  function moveSelection(delta) {
    if (state.selected < 0 || state.paused) return;
    const r = Math.floor(state.selected / 9);
    const c = state.selected % 9;
    let nr = r;
    let nc = c;
    for (let step = 0; step < 9; step++) {
      if (delta === -9) nr = (nr + 8) % 9;
      else if (delta === 9) nr = (nr + 1) % 9;
      else if (delta === -1) nc = (nc + 8) % 9;
      else if (delta === 1) nc = (nc + 1) % 9;
      const next = nr * 9 + nc;
      if (!state.given[nr][nc]) {
        state.selected = next;
        break;
      }
    }
    render();
  }

  /* ---------------- Init ---------------- */

  createBoard();
  newGame();
})();
