(() => {
  "use strict";

  const LEVELS = {
    easy: { name: "Fácil", clues: 42 },
    medium: { name: "Medio", clues: 34 },
    hard: { name: "Difícil", clues: 27 },
  };

  const state = {
    level: "easy",
    board: [],          // valores actuales (0 = vacío)
    solution: [],       // solución completa
    given: [],          // celdas originales (boolean)
    notes: [],          // notas por celda (Set)
    selected: -1,       // celda seleccionada (0-80)
    notesMode: false,
    errorCount: 0,
    mistakes: new Set(),
    history: [],
    timerInterval: null,
    startTime: null,
    elapsed: 0,
    finished: false,
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

  /* ---------------- Sudoku generation ---------------- */

  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  function solve(board) {
    const empty = findEmpty(board);
    if (!empty) return true;
    const [r, c] = empty;
    for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (isValid(board, r, c, n)) {
        board[r][c] = n;
        if (solve(board)) return true;
        board[r][c] = 0;
      }
    }
    return false;
  }

  function findEmpty(board) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) return [r, c];
      }
    }
    return null;
  }

  function isValid(board, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === n || board[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3;
    const bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[br + i][bc + j] === n) return false;
      }
    }
    return true;
  }

  function countSolutions(board, limit = 2) {
    let count = 0;
    const copy = board.map((row) => row.slice());

    function recurse() {
      const empty = findEmpty(copy);
      if (!empty) {
        count++;
        return;
      }
      const [r, c] = empty;
      for (let n = 1; n <= 9 && count < limit; n++) {
        if (isValid(copy, r, c, n)) {
          copy[r][c] = n;
          recurse();
          copy[r][c] = 0;
        }
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
    if (state.finished) return;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c]) {
      state.selected = i;
    } else {
      state.selected = state.selected === i ? -1 : i;
    }
    render();
  }

  function placeNumber(n) {
    if (state.selected < 0 || state.finished) return;
    const i = state.selected;
    const r = Math.floor(i / 9);
    const c = i % 9;
    if (state.given[r][c]) return;

    if (state.notesMode) {
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
      if (state.errorCount >= 3) {
        state.finished = true;
        stopTimer();
        showModal("Has perdido", "Cometiste 3 errores. ¡Inténtalo de nuevo!");
      }
    } else {
      state.mistakes.delete(i);
    }

    if (checkWin()) {
      state.finished = true;
      stopTimer();
      showModal("¡Felicidades!", `Completaste el sudoku en ${formatTime(state.elapsed)}`);
    }

    render();
  }

  function erase() {
    if (state.selected < 0 || state.finished) return;
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
    if (state.selected < 0 || state.finished) return;
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
    if (state.finished) return;
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
    timerEl.textContent = "00:00";
    modal.classList.add("hidden");
    render();
    startTimer();
  }

  /* ---------------- Events ---------------- */

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

  document.addEventListener("keydown", (e) => {
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
    if (state.selected < 0) return;
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
