import { officialArchive, tasks } from "./problems.js";
import { paintHero, paintIcons } from "./graphics.js";
import { mountJudge } from "./judge.js?v=judge3";

const $ = (id) => document.getElementById(id);
const byId = new Map(tasks.map((task) => [task.id, task]));
const filters = ["search", "season", "stage", "tour"];
const names = {
  archive: "Архив задач",
  saved: "Избранное",
  progress: "Мой прогресс",
  "stage-3": "III этап",
  "stage-4": "IV этап",
};
const fileExtensions = { cpp: "cpp", python: "py", java: "java", pascal: "pas", text: "txt" };
const uploadLanguages = { cpp: "cpp", cc: "cpp", cxx: "cpp", py: "python", java: "java", pas: "pascal", txt: "text" };
const maxDraftSize = 128 * 1024;
const storagePrefix = "beloi:";
const scoreFormat = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
let listView = "archive";
let route = { view: "archive" };
let noticeTimeout;
let taskJudge;
const saved = readTaskStates("saved");
const scores = readTaskStates("scores");
const passed = readTaskStates("passed");
const partNames = ["code", "output"];
const passedParts = new Map(tasks.filter((task) => task.mode === "mixed").map((task) => [
  task.id,
  new Set(partNames.filter((part) => read("part-pass:" + task.id + ":" + part, false) === true)),
]));

function read(key, fallback) {
  try {
    const value = localStorage.getItem(storagePrefix + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(storagePrefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100 && Math.round(value * 100) / 100 === value;
}

function readTaskStates(kind) {
  const previous = read(kind, {});
  const states = {};
  for (const task of tasks) {
    const value = read(kind + ":" + task.id, previous?.[task.id]);
    if (kind === "scores" ? isScore(value) : value === true) states[task.id] = value;
  }
  return states;
}

function updateTaskState(kind, id, value) {
  const states = { saved, scores, passed }[kind];
  if (kind === "scores" ? isScore(value) : value === true) states[id] = value;
  else delete states[id];
}

function hasPassed(task) {
  return task.mode === "mixed" ? passedParts.get(task.id).size === partNames.length : passed[task.id] === true;
}

function hasResult(task) {
  return isScore(scores[task.id]) || Boolean(passed[task.id]) || Boolean(passedParts.get(task.id)?.size);
}

function savePass(task, part) {
  if (task.mode === "mixed") {
    if (!partNames.includes(part)) return;
    passedParts.get(task.id).add(part);
    store("part-pass:" + task.id + ":" + part, true);
  } else {
    updateTaskState("passed", task.id, true);
    store("passed:" + task.id, true);
  }
  updateProgress();
}

function notice(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { toast.hidden = true; }, 3600);
}

function formatCount(n) {
  const word = { one: "задача", few: "задачи", many: "задач", other: "задачи" };
  return n + " " + word[new Intl.PluralRules("ru").select(n)];
}

function icon(name) {
  return `<span data-icon="${name}" aria-hidden="true"></span>`;
}

function roman(stage) {
  return stage === 3 ? "III" : "IV";
}

function stageTag(task) {
  return `<span class="stage-tag ${task.stage === 4 ? "final" : ""}">${roman(task.stage)} этап</span>`;
}

function letterBadge(task) {
  return `<span class="letter ${task.stage === 4 ? "final" : ""}">${task.letter}</span>`;
}

function toggleSaved(id, button) {
  const value = button.getAttribute("aria-pressed") !== "true";
  updateTaskState("saved", id, value);
  const persisted = store("saved:" + id, value);
  updateProgress();
  if (listView === "saved" && !route.task) {
    renderList();
    const nextBookmark = $("catalog-content").querySelector("[data-bookmark]");
    if (nextBookmark) nextBookmark.focus();
    else $("search").focus();
  } else {
    updateBookmark(button, value);
  }
  notice(persisted ? (value ? "Задача в избранном" : "Задача убрана из избранного") : "Браузер не сохранил избранное");
}

function updateBookmark(button, value) {
  button.setAttribute("aria-pressed", value);
  const label = value ? "Убрать из избранного" : "В избранное";
  button.setAttribute("aria-label", label);
  button.title = label;
  const buttonLabel = button.querySelector(".bookmark-label");
  if (buttonLabel) buttonLabel.textContent = label;
  paintIcons(button.parentElement);
}

function updateProgress() {
  const solved = tasks.filter((task) => hasPassed(task) || scores[task.id] === 100).length;
  const count = tasks.filter((task) => saved[task.id]).length;
  const percent = Math.round(solved * 100 / tasks.length);
  $("saved-count").textContent = count || "";
  $("progress-pct").textContent = percent + "%";
  $("progress-fill").style.width = percent + "%";
  $("progress-summary").textContent = solved + " из " + tasks.length + " закрыто";
}

function renderSummary() {
  const solved = tasks.filter(hasPassed).length;
  const count = tasks.filter(hasResult).length;
  const cents = tasks.reduce((sum, task) => sum + Math.round((scores[task.id] ?? 0) * 100), 0);
  const stats = listView === "progress"
    ? [["check", solved, "Тесты пройдены"], ["chart", scoreFormat.format(cents / 100), "Баллы олимпиады"], ["target", count, "Задач с результатом"]]
    : [["grid", tasks.length, "Задачи"], ["layers", "III и IV", "Этапы"], ["calendar", 2, "Сезона"]];
  $("summary").innerHTML = stats.map(([symbol, value, label]) => `
    <div class="metric"><span class="metric-icon" data-icon="${symbol}" aria-hidden="true"></span>
      <div><strong>${value}</strong><small>${label}</small></div></div>`).join("");
  paintIcons($("summary"));
}

function searched(value) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/gu, " ").trim();
}

function renderList() {
  const query = searched($("search").value);
  const selected = tasks.filter((task) => {
    if (query && !searched(task.title).includes(query)) return false;
    if ($("season").value && task.year !== Number($("season").value)) return false;
    if ($("stage").value && task.stage !== Number($("stage").value)) return false;
    if ($("tour").value && task.tour !== Number($("tour").value)) return false;
    if (listView === "saved") return Boolean(saved[task.id]);
    if (listView === "progress") return hasResult(task);
    return true;
  });
  $("result-count").textContent = formatCount(selected.length);
  if (!selected.length) {
    const filtered = filters.some((id) => $(id).value && !(id === "stage" && listView.startsWith("stage-")));
    const [heading, description] = filtered
      ? ["Задачи не найдены", "Попробуй другой запрос или сбрось фильтры."]
      : listView === "saved"
        ? ["Здесь будут избранные задачи", "Нажми значок закладки рядом с любой задачей."]
        : ["Здесь будут твои результаты", "Пройди проверку в карточке задачи."];
    const action = filtered
      ? '<button class="outline-btn" data-reset>Сбросить фильтры</button>'
      : '<a class="outline-btn" href="#archive">Открыть архив</a>';
    $("catalog-content").innerHTML = `<div class="empty"><h3>${heading}</h3><p>${description}</p>${action}</div>`;
    return;
  }
  $("catalog-content").innerHTML = `
    <div class="table-wrap"><table class="task-table">
      <thead><tr><th scope="col">Задача</th><th scope="col">Сезон</th><th scope="col">Этап</th><th scope="col" class="tour-column">Тур</th><th scope="col" class="status-column">Результат</th><th scope="col"><span class="sr-only">Действия</span></th></tr></thead>
      <tbody>${selected.map(row).join("")}</tbody>
    </table></div>`;
  paintIcons($("catalog-content"));
}

function row(task) {
  const score = scores[task.id];
  const complete = hasPassed(task);
  const partial = passedParts.get(task.id)?.size;
  const training = complete ? "Тесты пройдены" : partial ? "1 из 2 частей" : passed[task.id] ? "Прежний зачёт" : "—";
  const status = score === 100 ? "100 · Решено" : isScore(score) ? scoreFormat.format(score) + " / 100" : training;
  const scoreClass = score === 100 ? "solved" : isScore(score) ? "scored" : complete ? "solved" : partial ? "scored" : "";
  const bookmark = saved[task.id] ? "Убрать из избранного" : "В избранное";
  return `<tr>
    <td><a class="task-name" href="#task/${task.id}">${letterBadge(task)}<span>${task.title}<small class="task-compact">Тур ${task.tour}<span class="compact-score ${scoreClass}">${status !== "—" ? " · " + status : ""}</span></small></span></a></td>
    <td>${task.season}</td><td>${stageTag(task)}</td><td class="tour-column">${task.tour}</td>
    <td class="status-column"><span class="row-status ${scoreClass}">${status}</span></td>
    <td class="row-actions"><button class="icon-btn" data-icon="bookmark" data-bookmark="${task.id}" aria-label="${bookmark}" aria-pressed="${Boolean(saved[task.id])}" title="${bookmark}"></button>
    <a class="icon-btn" href="#task/${task.id}" title="Открыть задачу" aria-label="Открыть задачу ${task.letter}" data-icon="chevron-right"></a></td>
  </tr>`;
}

function resetFilters() {
  for (const id of filters) $(id).value = "";
  if (listView.startsWith("stage-")) $("stage").value = listView.slice(-1);
}

function renderRoute(moveFocus = false) {
  taskJudge?.dispose();
  taskJudge = undefined;
  const hash = location.hash.slice(1);
  const task = byId.get(hash.startsWith("task/") ? hash.slice(5) : "");
  const view = task ? listView : Object.hasOwn(names, hash) ? hash : "archive";
  if (!task && listView !== view) {
    listView = view;
    resetFilters();
  }
  route = { view, task };
  for (const link of document.querySelectorAll("[data-view]")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  $("crumb").textContent = task ? task.title : names[view];
  document.title = (task?.title ?? names[view]) + " · BelOI";
  $("archive-view").hidden = Boolean(task);
  $("task-view").hidden = !task;
  if (task) {
    renderTask(task);
  } else {
    $("task-view").replaceChildren();
    $("catalog-title").textContent = names[view];
    $("catalog-note").textContent = {
      archive: "Выбери сезон, этап или тур.",
      saved: "Задачи, к которым ты хочешь вернуться.",
      progress: "Пройденные тесты и баллы, которые ты записал вручную.",
      "stage-3": "Областной этап республиканской олимпиады.",
      "stage-4": "Заключительный этап республиканской олимпиады.",
    }[view];
    $("hero").hidden = view !== "archive";
    $("summary").hidden = view !== "archive" && view !== "progress";
    $("stage").disabled = view.startsWith("stage-");
    renderSummary();
    renderList();
    if (view === "archive") paintHero($("hero-graph"));
  }
  closeNavigation();
  window.scrollTo(0, 0);
  if (moveFocus) $(task ? "task-title" : "catalog-title").focus({ preventScroll: true });
}

function renderTask(task) {
  const key = "draft:" + task.id;
  const draft = read(key, {}) ?? {};
  const language = Object.hasOwn(fileExtensions, draft.language) ? draft.language : task.mode === "outputs" ? "text" : "cpp";
  const bookmark = saved[task.id] ? "Убрать из избранного" : "В избранное";
  const taskIndex = tasks.indexOf(task);
  const neighbor = (offset, label) => {
    const next = tasks[taskIndex + offset];
    return next && next.tour === task.tour && next.stage === task.stage && next.year === task.year
      ? `<a href="#task/${next.id}">${label} · ${next.letter}</a>`
      : "<span></span>";
  };
  const checked = isScore(scores[task.id]);
  $("task-view").innerHTML = `
    <div class="task-top">
      <a class="back" href="#${listView}">${icon("arrow-left")} ${names[listView]}</a>
      <button class="outline-btn" data-bookmark="${task.id}" aria-pressed="${Boolean(saved[task.id])}" aria-label="${bookmark}" title="${bookmark}">${icon("bookmark")}<span class="bookmark-label">${bookmark}</span></button>
    </div>
    <section class="task-card" aria-labelledby="task-title">
      <div class="task-title">${letterBadge(task)}<h1 id="task-title" tabindex="-1">${task.title}</h1></div>
      <div class="task-meta">
        ${stageTag(task)}<span>Тур ${task.tour}</span><span>${icon("calendar")} ${task.date}</span>
        ${task.time === null ? '<span>Открытые тесты</span>' : `<span>${icon("clock")} ${String(task.time).replace(".", ",")} с</span><span>${icon("memory")} ${task.memory} МБ</span>`}
        ${task.mode === "interactive" ? "<span>Интерактивная задача</span>" : ""}
      </div>
    </section>
    <div class="task-grid">
      <section class="task-card statement-card" aria-labelledby="statement-title">
        <div class="card-head"><h2 id="statement-title">Условие</h2></div>
        <p class="statement-summary">${task.summary}</p>
        <div class="statement-source">
          <div><strong>Полное условие</strong><small>Входные данные, ограничения, примеры и баллы за подзадачи · стр. ${task.page}</small></div>
          <a class="outline-btn" href="${task.statement}" target="_blank" rel="noopener noreferrer">Открыть PDF ${icon("external")}</a>
        </div>
      </section>
      <section class="task-card" aria-labelledby="editor-title">
        <div class="card-head"><h2 id="editor-title">${task.mode === "outputs" ? "Черновик ответа" : "Редактор решения"}</h2></div>
        <div class="editor-shell">
          <div class="editor-bar">
            <select id="language" aria-label="Язык черновика"><option value="cpp">C++</option><option value="python">Python</option><option value="java">Java</option><option value="pascal">Pascal</option><option value="text">Текст</option></select>
            <small id="draft-status"></small>
          </div>
          <textarea id="code" aria-label="Текст решения" placeholder="${task.mode === "outputs" ? "Запиши ответ…" : "Напиши код или загрузи файл…"}" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="${maxDraftSize}"></textarea>
        </div>
        <div class="editor-actions">
          <label class="outline-btn file-label" title="Загрузить файл">${icon("upload")} Файл<input type="file" id="file" class="sr-only" accept=".cpp,.cc,.cxx,.py,.java,.pas,.txt" aria-label="Загрузить файл"></label>
          <button class="outline-btn" id="copy" title="Копировать код" aria-label="Копировать код">${icon("copy")} Копировать</button>
          <button class="outline-btn" id="download" title="Скачать черновик" aria-label="Скачать черновик">${icon("download")}</button>
        </div>
        <section class="judge-panel" id="judge-panel" aria-label="Проверка решения"></section>
        <details class="score-form" ${checked ? "open" : ""}>
          <summary>Записать баллы олимпиады вручную</summary>
          <form id="score-form">
          <label for="score">Баллы из Контеста</label>
          <div class="score-input">
            <input id="score" type="number" inputmode="decimal" min="0" max="100" step="0.01" required placeholder="0–100" value="${checked ? scores[task.id] : ""}">
            <button class="outline-btn">Записать</button>
            <button class="outline-btn remove-score" id="remove-score" type="button" ${checked ? "" : "hidden"}>Убрать</button>
          </div>
          </form>
        </details>
      </section>
    </div>
    <nav class="task-nav" aria-label="Задачи тура">${neighbor(-1, "Предыдущая")}${neighbor(1, "Следующая")}</nav>`;
  paintIcons($("task-view"));
  bindEditor(key, draft, language);
  taskJudge = mountJudge($("judge-panel"), {
    task,
    source: $("code"),
    language: $("language"),
    onPass(part) { savePass(task, part); },
    getParts() { return passedParts.get(task.id); },
    hasLegacyPass: task.mode === "mixed" && passed[task.id] === true,
    hasOutputPass(index, input) {
      return read("output-pass:" + task.id + ":" + index, null) === input;
    },
    onOutputPass(index, input) {
      store("output-pass:" + task.id + ":" + index, input);
    },
  });
  $("score-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const scoreInput = $("score");
    const value = scoreInput.valueAsNumber;
    if (!isScore(value)) return;
    updateTaskState("scores", task.id, value);
    scoreInput.defaultValue = String(value);
    scoreInput.value = scoreInput.defaultValue;
    $("remove-score").hidden = false;
    updateProgress();
    notice(store("scores:" + task.id, value) ? "Баллы записаны" : "Браузер не сохранил баллы");
  });
  $("remove-score").addEventListener("click", () => {
    updateTaskState("scores", task.id, null);
    $("score").defaultValue = "";
    $("score").value = "";
    $("remove-score").hidden = true;
    updateProgress();
    notice(store("scores:" + task.id, null) ? "Результат убран" : "Браузер не сохранил изменение");
  });
}

function bindEditor(key, draft, language) {
  const code = $("code");
  const file = $("file");
  const languageSelect = $("language");
  const status = $("draft-status");
  languageSelect.value = language;
  code.value = draft.code ?? "";
  status.textContent = draft.code ? "Сохранено в браузере" : "Черновик";
  let revision = 0;
  const saveDraft = () => {
    revision++;
    status.textContent = store(key, { language: languageSelect.value, code: code.value })
      ? "Сохранено в браузере"
      : "Черновик не сохранён";
  };
  code.addEventListener("input", saveDraft);
  languageSelect.addEventListener("change", saveDraft);
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    const importRevision = ++revision;
    if (selected.size > maxDraftSize) {
      notice("Выбери файл до 128 КБ");
      return;
    }
    try {
      const contents = await selected.text();
      if (!code.isConnected || importRevision !== revision) return;
      if (contents.includes("\0")) {
        notice("Выбери текстовый файл с исходным кодом");
        return;
      }
      code.value = contents;
      const extension = selected.name.split(".").pop().toLowerCase();
      if (Object.hasOwn(uploadLanguages, extension)) languageSelect.value = uploadLanguages[extension];
      saveDraft();
      code.focus();
    } catch {
      if (code.isConnected && importRevision === revision) notice("Не удалось прочитать файл");
    }
  });
  $("copy").addEventListener("click", async () => {
    if (!code.value) {
      notice("Черновик пока пуст");
      return;
    }
    try {
      await navigator.clipboard.writeText(code.value);
      notice("Код скопирован");
    } catch {
      code.focus();
      code.select();
      notice("Код выделен. Нажми Ctrl+C или ⌘C.");
    }
  });
  $("download").addEventListener("click", () => {
    if (!code.value) {
      notice("Черновик пока пуст");
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([code.value], { type: "text/plain;charset=utf-8" }));
    link.download = "beloi-" + key.slice(6) + "." + fileExtensions[languageSelect.value];
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
}

function closeNavigation() {
  if (!$("sidebar").classList.contains("open")) return false;
  $("sidebar").classList.remove("open");
  $("mobile-nav").setAttribute("aria-expanded", "false");
  return true;
}

function syncTaskStates(event) {
  if (!event.key?.startsWith(storagePrefix)) return;
  const [kind, id, part] = event.key.slice(storagePrefix.length).split(":");
  if (kind === "part-pass" && passedParts.has(id) && partNames.includes(part)) {
    const current = passedParts.get(id);
    if (read("part-pass:" + id + ":" + part, false) === true) current.add(part);
    else current.delete(part);
    updateProgress();
    if (route.task?.id === id) taskJudge?.refreshParts();
    if (!route.task) {
      if (listView === "progress") renderSummary();
      renderList();
    }
    return;
  }
  if (!["saved", "scores", "passed"].includes(kind) || !byId.has(id)) return;
  // Read current storage in case more changes arrived after this event was queued.
  const value = read(kind + ":" + id, read(kind, {})?.[id]);
  updateTaskState(kind, id, value);
  updateProgress();
  if (!route.task) {
    if (kind !== "saved" && listView === "progress") renderSummary();
    renderList();
    return;
  }
  if (route.task.id !== id) return;
  if (kind === "saved") {
    updateBookmark($("task-view").querySelector("[data-bookmark]"), value === true);
  } else if (kind === "scores") {
    const input = $("score");
    const unedited = input.value === input.defaultValue;
    input.defaultValue = isScore(value) ? String(value) : "";
    if (unedited) input.value = input.defaultValue;
    $("remove-score").hidden = !isScore(value);
  }
}

$("source-link").href = officialArchive;
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("main").focus();
});
for (const id of filters) $(id).addEventListener(id === "search" ? "input" : "change", renderList);
$("browse-btn").addEventListener("click", () => {
  $("catalog").focus({ preventScroll: true });
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  $("catalog").scrollIntoView({ behavior });
});
$("mobile-nav").addEventListener("click", () => {
  const open = $("sidebar").classList.toggle("open");
  $("mobile-nav").setAttribute("aria-expanded", open);
  if (open) $("sidebar").querySelector("[aria-current='page']").focus();
});

document.addEventListener("click", (event) => {
  const bookmark = event.target.closest("[data-bookmark]");
  if (bookmark) toggleSaved(bookmark.dataset.bookmark, bookmark);
  if (event.target.closest("[data-help]")) {
    if (closeNavigation()) $("mobile-nav").focus();
    $("help-dialog").showModal();
  }
  if (event.target.closest("[data-close]")) $("help-dialog").close();
  if (event.target.closest("[data-reset]")) {
    resetFilters();
    renderList();
    $("search").focus();
  }
  if (!$("sidebar").contains(event.target) && !$("mobile-nav").contains(event.target)) closeNavigation();
  const sideLink = event.target.closest(".sidebar a");
  if (sideLink && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    if (closeNavigation() && sideLink.hash === location.hash) $("mobile-nav").focus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && closeNavigation()) $("mobile-nav").focus();
  if (event.key === "/" && !route.task && !$("help-dialog").open
      && !event.ctrlKey && !event.metaKey && !event.altKey
      && !event.target.closest("input, textarea, select, [contenteditable]")) {
    event.preventDefault();
    $("search").focus();
  }
});

window.addEventListener("hashchange", () => renderRoute(true));
window.addEventListener("storage", syncTaskStates);
new ResizeObserver(() => paintHero($("hero-graph"))).observe($("hero"));
paintIcons();
updateProgress();
renderRoute();
