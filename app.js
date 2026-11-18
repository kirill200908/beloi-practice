import { officialArchive, tasks } from "./problems.js";
import { paintHero, paintIcons } from "./graphics.js";

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
let listView = "archive";
let route = { view: "archive" };
let noticeTimeout;
let saved = read("saved", {});
let scores = read("scores", {});

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("beloi:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem("beloi:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
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
  if (saved[id]) delete saved[id];
  else saved[id] = true;
  const persisted = store("saved", saved);
  updateProgress();
  if (listView === "saved" && !route.task) {
    renderList();
    const nextBookmark = $("catalog-content").querySelector("[data-bookmark]");
    if (nextBookmark) nextBookmark.focus();
    else $("search").focus();
  } else {
    button.setAttribute("aria-pressed", Boolean(saved[id]));
    const label = saved[id] ? "Убрать из избранного" : "В избранное";
    button.setAttribute("aria-label", label);
    button.title = label;
    if (button.querySelector(".bookmark-label")) button.querySelector(".bookmark-label").textContent = label;
    paintIcons(button.parentElement);
  }
  notice(persisted ? (saved[id] ? "Задача в избранном" : "Задача убрана из избранного") : "Браузер не сохранил избранное");
}

function updateProgress() {
  const solved = tasks.filter((task) => scores[task.id] === 100).length;
  const count = tasks.filter((task) => saved[task.id]).length;
  const percent = Math.round(solved * 100 / tasks.length);
  $("saved-count").textContent = count || "";
  $("progress-pct").textContent = percent + "%";
  $("progress-fill").style.width = percent + "%";
  $("progress-summary").textContent = solved + " из " + tasks.length + " решено";
}

function renderSummary() {
  const solved = tasks.filter((task) => scores[task.id] === 100).length;
  const count = tasks.filter((task) => Number.isInteger(scores[task.id])).length;
  const points = tasks.reduce((sum, task) => sum + (scores[task.id] || 0), 0);
  const stats = listView === "progress"
    ? [["check", solved, "Решено на 100"], ["chart", points, "Баллов набрано"], ["target", count, "Задач с результатом"]]
    : [["grid", tasks.length, "Задачи"], ["layers", "III и IV", "Этапы"], ["calendar", 2, "Сезона"]];
  $("summary").innerHTML = stats.map(([symbol, value, label]) => `
    <div class="metric"><span class="metric-icon" data-icon="${symbol}" aria-hidden="true"></span>
      <div><strong>${value}</strong><small>${label}</small></div></div>`).join("");
  paintIcons($("summary"));
}

function searched(value) {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
}

function renderList() {
  const query = searched($("search").value);
  const selected = tasks.filter((task) => {
    if (query && !searched(task.title).includes(query)) return false;
    if ($("season").value && task.year !== Number($("season").value)) return false;
    if ($("stage").value && task.stage !== Number($("stage").value)) return false;
    if ($("tour").value && task.tour !== Number($("tour").value)) return false;
    if (listView === "saved") return Boolean(saved[task.id]);
    if (listView === "progress") return Number.isInteger(scores[task.id]);
    return true;
  });
  $("result-count").textContent = formatCount(selected.length);
  if (!selected.length) {
    const filtered = filters.some((id) => $(id).value && !(id === "stage" && listView.startsWith("stage-")));
    const [heading, description] = filtered
      ? ["Задачи не найдены", "Попробуй другой запрос или сбрось фильтры."]
      : listView === "saved"
        ? ["Здесь будут избранные задачи", "Нажми значок закладки рядом с любой задачей."]
        : ["Здесь будут твои результаты", "Запиши баллы после проверки в карточке задачи."];
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
  const status = score === 100 ? "100 · Решено" : Number.isInteger(score) ? score + " / 100" : "—";
  const scoreClass = score === 100 ? "solved" : Number.isInteger(score) ? "scored" : "";
  const bookmark = saved[task.id] ? "Убрать из избранного" : "В избранное";
  return `<tr>
    <td><a class="task-name" href="#task/${task.id}">${letterBadge(task)}<span>${task.title}</span></a></td>
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

function renderRoute() {
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
      progress: "Баллы, которые ты записал после проверки.",
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
}

function renderTask(task) {
  const key = "draft:" + task.id;
  const draft = read(key, {});
  const language = fileExtensions[draft.language] ? draft.language : task.mode === "outputs" ? "text" : "cpp";
  const bookmark = saved[task.id] ? "Убрать из избранного" : "В избранное";
  const taskIndex = tasks.indexOf(task);
  const neighbor = (offset, label) => {
    const next = tasks[taskIndex + offset];
    return next && next.tour === task.tour && next.stage === task.stage && next.year === task.year
      ? `<a href="#task/${next.id}">${label} · ${next.letter}</a>`
      : "<span></span>";
  };
  const judgeNote = {
    outputs: "Это задача с открытыми тестами. Смотри в контесте, в каком формате отправлять выходные файлы.",
    mixed: "У задачи две части с разными форматами сдачи. Найди обе по названию в контесте.",
    interactive: "Отправь программу в Яндекс Контест. Она будет обмениваться запросами с программой жюри.",
    code: "Войди в Яндекс Контест, найди задачу " + task.letter + " и отправь код. Контест покажет вердикт и баллы.",
  }[task.mode];
  const checked = Number.isInteger(scores[task.id]);
  $("task-view").innerHTML = `
    <div class="task-top">
      <a class="back" href="#${listView}">${icon("arrow-left")} ${names[listView]}</a>
      <button class="outline-btn" data-bookmark="${task.id}" aria-pressed="${Boolean(saved[task.id])}" aria-label="${bookmark}" title="${bookmark}">${icon("bookmark")}<span class="bookmark-label">${bookmark}</span></button>
    </div>
    <section class="task-card" aria-labelledby="task-title">
      <div class="task-title">${letterBadge(task)}<h1 id="task-title">${task.title}</h1></div>
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
        <p class="detail-text">${judgeNote}</p>
        <a class="primary-btn" id="judge" href="${task.judge}" target="_blank" rel="noopener noreferrer">Открыть проверку ${icon("external")}</a>
        <a class="judge-backup" href="${task.judgeIndex}" target="_blank" rel="noopener noreferrer">Все контесты ${icon("external")}</a>
        <form class="score-form" id="score-form">
          <label for="score">Баллы из Контеста</label>
          <div class="score-input">
            <input id="score" type="number" min="0" max="100" step="1" required placeholder="0–100" value="${checked ? scores[task.id] : ""}">
            <button class="outline-btn">Записать</button>
            <button class="outline-btn remove-score" id="remove-score" type="button" ${checked ? "" : "hidden"}>Убрать</button>
          </div>
        </form>
      </section>
    </div>
    <nav class="task-nav" aria-label="Задачи тура">${neighbor(-1, "Предыдущая")}${neighbor(1, "Следующая")}</nav>`;
  paintIcons($("task-view"));
  bindEditor(key, draft, language);
  $("score-form").addEventListener("submit", (event) => {
    event.preventDefault();
    scores[task.id] = $("score").valueAsNumber;
    $("remove-score").hidden = false;
    updateProgress();
    notice(store("scores", scores) ? "Баллы записаны" : "Браузер не сохранил баллы");
  });
  $("remove-score").addEventListener("click", () => {
    delete scores[task.id];
    $("score").value = "";
    $("remove-score").hidden = true;
    updateProgress();
    notice(store("scores", scores) ? "Результат убран" : "Браузер не сохранил изменение");
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
  const saveDraft = () => {
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
    if (selected.size > maxDraftSize) {
      notice("Выбери файл до 128 КБ");
      return;
    }
    try {
      const contents = await selected.text();
      if (!code.isConnected) return;
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
      notice("Не удалось прочитать файл");
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
  $("sidebar").classList.remove("open");
  $("mobile-nav").setAttribute("aria-expanded", "false");
}

$("source-link").href = officialArchive;
for (const id of filters) $(id).addEventListener(id === "search" ? "input" : "change", renderList);
$("browse-btn").addEventListener("click", () => {
  $("catalog").focus({ preventScroll: true });
  const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  $("catalog").scrollIntoView({ behavior });
});
$("mobile-nav").addEventListener("click", () => {
  const open = $("sidebar").classList.toggle("open");
  $("mobile-nav").setAttribute("aria-expanded", open);
});

document.addEventListener("click", (event) => {
  const bookmark = event.target.closest("[data-bookmark]");
  if (bookmark) toggleSaved(bookmark.dataset.bookmark, bookmark);
  if (event.target.closest("[data-help]")) {
    closeNavigation();
    $("help-dialog").showModal();
  }
  if (event.target.closest("[data-close]")) $("help-dialog").close();
  if (event.target.closest("[data-reset]")) {
    resetFilters();
    renderList();
    $("search").focus();
  }
  if (!$("sidebar").contains(event.target) && !$("mobile-nav").contains(event.target)) closeNavigation();
  if (event.target.closest(".sidebar a")) closeNavigation();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeNavigation();
  if (event.key === "/" && !route.task && !$("help-dialog").open
      && !event.ctrlKey && !event.metaKey && !event.altKey
      && !event.target.closest("input, textarea, select, [contenteditable]")) {
    event.preventDefault();
    $("search").focus();
  }
});

window.addEventListener("hashchange", renderRoute);
new ResizeObserver(() => paintHero($("hero-graph"))).observe($("hero"));
paintIcons();
updateProgress();
renderRoute();
