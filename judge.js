import { checkResult } from "./judge-checkers.js";

const languages = new Set(["cpp", "python"]);
const workerURL = new URL("./judge-worker.js?v=judge2", import.meta.url);
const frameURL = new URL("./judge-sandbox.html", import.meta.url);
const inputLimit = 128 * 1024;
const prepTimeout = 150000;
const compileTimeout = 60000;
const cppLibraryFiles = {
  "libc++.a": "judge-libcxx.a.gz",
  "libc++abi.a": "judge-libcxxabi.a.gz",
  "libunwind.a": "judge-libunwind.a.gz",
};
let workerSource;
let cppArchives;

function loadWorkerSource() {
  workerSource ??= fetch(workerURL).then((response) => {
    if (!response.ok) throw new Error("Не удалось загрузить модуль проверки.");
    return response.text();
  }).catch((error) => {
    workerSource = undefined;
    throw error;
  });
  return workerSource;
}

function loadCppArchives() {
  cppArchives ??= Promise.all(Object.entries(cppLibraryFiles).map(async ([name, file]) => {
    const response = await fetch(new URL(file + "?v=wasi-sdk-34", import.meta.url));
    if (!response.ok) throw new Error("Не удалось загрузить стандартную библиотеку C++.");
    return [name, await response.arrayBuffer()];
  })).catch((error) => {
    cppArchives = undefined;
    throw error;
  });
  return cppArchives;
}

function startJudge({ language, source, cases, time, memory, custom }, onPhase) {
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  iframe.title = "Изолированная среда выполнения";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.src = frameURL.href;
  const channel = new MessageChannel();
  const executed = [];
  let timer;
  let resolved = false;
  let settle;
  const result = new Promise((resolve) => { settle = resolve; });
  function finish(outcome) {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    channel.port1.close();
    iframe.remove();
    settle({ executed, ...outcome });
  }
  function startTimer(ms, outcome) {
    clearTimeout(timer);
    timer = setTimeout(() => finish(outcome), ms);
  }

  startTimer(prepTimeout, { status: "error", message: "Среда загружается слишком долго. Проверь подключение и повтори запуск." });
  channel.port1.onmessage = ({ data }) => {
    if (!data || !data.type) return;
    if (data.type === "phase") {
      onPhase(data.phase, data.index);
      if (data.phase === "compile") {
        startTimer(compileTimeout, { status: "error", message: "Компиляция заняла слишком много времени." });
      } else if (data.phase === "run") {
        const inputLength = cases[data.index].input.length;
        const ioAllowance = Math.min(16000, 2000 * Math.floor(inputLength / 131072));
        // WASI and Python read stdin through JavaScript, which adds overhead on large inputs.
        const timeLimit = Math.max(2500, 3000 * (time ?? 2)) + ioAllowance;
        startTimer(timeLimit, { status: "time", index: data.index });
      }
    } else if (data.type === "problem" || data.type === "compile-error") {
      finish({ status: data.type === "problem" ? "error" : "compile", message: data.message });
    } else if (data.type === "case-error") {
      finish({ status: data.outputLimit ? "output-limit" : "runtime", index: data.index, message: data.outputLimit ? "" : data.message });
    } else if (data.type === "case") {
      if (data.code) {
        finish({ status: "runtime", index: data.index, output: data.output, message: data.detail || `Код завершения: ${data.code}.` });
        return;
      }
      if (custom) {
        finish({ status: "finished", output: data.output, message: data.detail, ms: data.ms });
        return;
      }
      const test = cases[data.index];
      const verdict = checkResult(test, data);
      if (!verdict.correct) {
        finish({ status: verdict.partial ? "partial" : "wrong", index: data.index, output: data.output, message: verdict.message, ms: data.ms });
        return;
      }
      executed.push({ index: data.index, ms: data.ms });
    } else if (data.type === "done") {
      finish({ status: "accepted" });
    }
  };
  iframe.addEventListener("load", async () => {
    try {
      const [sourceText, archives] = await Promise.all([
        loadWorkerSource(), language === "cpp" ? loadCppArchives() : null,
      ]);
      if (!resolved) iframe.contentWindow.postMessage({
        type: "beloi-start", workerSource: sourceText, job: { language, source, cases, memory, archives },
      }, "*", [channel.port2]); // The sandbox has an opaque origin.
    } catch (error) {
      finish({ status: "error", message: String(error.message || error) });
    }
  }, { once: true });
  document.body.append(iframe);
  return { result, cancel: () => finish({ status: "cancelled" }) };
}

const verdictNames = {
  accepted: "Все тесты пройдены",
  finished: "Программа завершилась",
  wrong: "Неверный ответ",
  partial: "Частичный результат",
  compile: "Ошибка компиляции",
  runtime: "Ошибка выполнения",
  time: "Превышено время",
  "output-limit": "Превышен лимит вывода",
  error: "Проверка не запустилась",
  cancelled: "Проверка остановлена",
};

function displayText(text) {
  if (typeof text !== "string" || !text) return "∅";
  return text.length <= 4000 ? text : text.slice(0, 4000) + "\n…";
}

function addBlock(node, label, text) {
  const heading = document.createElement("strong");
  heading.textContent = label;
  const pre = document.createElement("pre");
  pre.textContent = displayText(text);
  node.append(heading, pre);
}

function showResult(node, result, cases) {
  node.replaceChildren();
  node.hidden = false;
  node.dataset.verdict = result.status;
  const title = document.createElement("strong");
  const isTest = Number.isInteger(result.index);
  const passed = result.executed?.length ?? 0;
  title.textContent = verdictNames[result.status] + (isTest ? ` · тест ${result.index + 1}` : "");
  node.append(title);
  if (result.status === "accepted" || (isTest && cases.length > 1)) {
    const count = document.createElement("small");
    count.textContent = `Пройдено ${passed} из ${cases.length}`;
    node.append(count);
  }
  if (Number.isFinite(result.ms)) {
    const time = document.createElement("small");
    time.textContent = `${Math.round(result.ms)} мс на этом устройстве`;
    node.append(time);
  }
  if (result.message) {
    if (["compile", "runtime", "error"].includes(result.status)) {
      const details = document.createElement("pre");
      details.textContent = displayText(result.message);
      node.append(details);
    } else {
      const detail = document.createElement("p");
      detail.textContent = result.message;
      node.append(detail);
    }
  }
  if (result.status === "finished") addBlock(node, "Вывод программы", result.output);
  if (isTest && result.output !== undefined) {
    const test = cases[result.index];
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Посмотреть ввод и вывод";
    details.append(summary);
    addBlock(details, "Ввод", test.input);
    addBlock(details, "Твой вывод", result.output);
    if (!test.checker) addBlock(details, "Ожидаемый вывод", test.output);
    node.append(details);
  }
}

function createOptions(select, cases, label) {
  select.replaceChildren(...cases.map((test, index) => {
    const descriptor = test.optional ? "демонстрация оценки" : test.kind === "example" ? "из условия" : "тренировочный";
    return new Option(`${label} ${index + 1} · ${descriptor}`, index);
  }));
}

export function mountJudge(root, { task, source, language, onPass, getParts, hasLegacyPass, hasOutputPass, onOutputPass }) {
  root.innerHTML = `
    <div class="judge-heading"><h3>Проверка на сайте</h3><small class="judge-local">Без входа</small></div>
    <p class="detail-text judge-context">Загружаем список тестов…</p>
    ${task.mode === "mixed" ? '<label class="judge-choice">Часть задачи<select data-judge-part><option value="code">Часть 1 · программа</option><option value="output">Часть 2 · выходные данные</option></select></label>' : ""}
    ${task.mode === "mixed" ? '<p class="detail-text" data-part-progress></p>' : ""}
    <div data-code-pane hidden>
      <div class="judge-buttons"><button class="primary-btn" type="button" data-run-suite>Проверить решение</button><button class="outline-btn" type="button" data-stop hidden>Остановить</button></div>
      ${task.mode === "interactive" ? "" : '<details class="judge-extra"><summary>Свой ввод</summary><div class="judge-custom"><label>Входные данные<textarea data-custom-input spellcheck="false" maxlength="131072" rows="4"></textarea></label><button class="outline-btn" type="button" data-run-custom>Запустить</button></div></details>'}
    </div>
    <div data-output-pane hidden>
      <label class="judge-choice">Входной файл<select data-output-test></select></label>
      <pre data-file-input class="judge-file-input"></pre>
      ${task.mode === "mixed" ? '<label class="judge-choice">Твой вывод<textarea data-output-value spellcheck="false" maxlength="131072" rows="3"></textarea></label>' : ""}
      <div class="judge-buttons">
        <button class="primary-btn" type="button" data-check-output>Проверить ответ</button>
        <button class="outline-btn" type="button" data-run-output-suite>Проверить программу на всех тестах</button>
        <button class="outline-btn" type="button" data-stop-output hidden>Остановить</button>
      </div>
    </div>
    <div class="judge-result" data-judge-result role="status" aria-live="polite" hidden></div>`;
  const pick = (selector) => root.querySelector(selector);
  const context = pick(".judge-context");
  const pane = pick("[data-code-pane]");
  const outputPane = pick("[data-output-pane]");
  const mode = pick("[data-judge-part]");
  const partProgress = pick("[data-part-progress]");
  const check = pick("[data-run-suite]");
  const stop = pick("[data-stop]");
  const run = pick("[data-run-custom]");
  const fileMenu = pick("[data-output-test]");
  const checkOutput = pick("[data-check-output]");
  const checkGenerator = pick("[data-run-output-suite]");
  const stopOutput = pick("[data-stop-output]");
  const resultNode = pick("[data-judge-result]");
  let codeCases = [];
  let outputCases = [];
  const completedOutputs = new Set();
  let active = null;
  let unmounted = false;

  function refreshParts() {
    if (!partProgress) return;
    const completed = getParts();
    if (!completed.size && hasLegacyPass) {
      partProgress.textContent = "В прежнем зачёте части не различались. Пройди проверку каждой части.";
      return;
    }
    partProgress.textContent = "Пройдено частей: " + completed.size + " из 2.";
  }

  function fileChanged() {
    pick("[data-file-input]").textContent = outputCases[Number(fileMenu.value)]?.input ?? "";
    resultNode.hidden = true;
  }

  function refresh() {
    refreshParts();
    const showOutput = task.mode === "outputs" || mode?.value === "output";
    pane.hidden = showOutput;
    outputPane.hidden = !showOutput;
    const examples = codeCases.filter((test) => test.kind === "example").length;
    const practice = codeCases.length - examples;
    if (showOutput) {
      context.textContent = outputCases.length
        ? `${outputCases.filter((test) => !test.optional).length} тестов для программы. Можно также проверить готовый ответ для выбранного файла.`
        : "Для этой части пока нет входных файлов.";
    } else {
      context.textContent = codeCases.length
        ? `${codeCases.length} тестов · примеров из условия ${examples}, тренировочных ${practice}. C++20 и Python 3.`
        : "Для этой задачи пока нет набора автопроверки. Можно запустить код на своём вводе.";
    }
    if (!showOutput && task.id === "2025-4-2-C") context.textContent += " Спорный пример из PDF исключён из автопроверки.";
    check.disabled = !codeCases.length || Boolean(active);
    checkOutput.disabled = !outputCases.length || Boolean(active);
    checkGenerator.disabled = !outputCases.length || Boolean(active);
    fileMenu.disabled = Boolean(active);
    if (run) run.disabled = Boolean(active);
    if (mode) mode.disabled = Boolean(active);
    stop.hidden = !active;
    stopOutput.hidden = !active;
  }

  async function submit(custom, suite = codeCases, part = "code") {
    if (active) return;
    if (!source.value.trim()) {
      showResult(resultNode, { status: "error", message: "Сначала введи код в редактор." }, []);
      return;
    }
    if (!languages.has(language.value)) {
      showResult(resultNode, { status: "error", message: "Для запуска выбери C++ или Python." }, []);
      return;
    }
    const input = pick("[data-custom-input]")?.value ?? "";
    if (input.length > inputLimit) return;
    const cases = custom ? [{ input }] : suite;
    if (!cases.length) return;
    resultNode.hidden = false;
    resultNode.dataset.verdict = "running";
    resultNode.textContent = "Запускаем проверку…";
    const job = startJudge({ language: language.value, source: source.value, cases, time: task.time, memory: task.memory ?? 256, custom }, (phase, index) => {
      resultNode.textContent = phase === "load" ? "Загружаем среду выполнения…"
        : phase === "compile" ? "Подготавливаем программу…"
        : custom ? "Выполняем программу…" : `Выполняем тест ${index + 1} из ${cases.length}…`;
    });
    active = job;
    refresh();
    const verdict = await job.result;
    if (unmounted) return;
    active = null;
    showResult(resultNode, verdict, cases);
    if (!custom && verdict.status === "accepted" && cases.some((test) => test.kind === "practice")) onPass(part);
    refresh();
  }

  check.addEventListener("click", () => submit(false));
  run?.addEventListener("click", () => submit(true));
  stop.addEventListener("click", () => active?.cancel());
  checkGenerator.addEventListener("click", () => submit(false, outputCases.filter((test) => !test.optional), "output"));
  stopOutput.addEventListener("click", () => active?.cancel());
  mode?.addEventListener("change", () => { refresh(); fileChanged(); });
  fileMenu.addEventListener("change", fileChanged);
  checkOutput.addEventListener("click", () => {
    const output = (pick("[data-output-value]") ?? source).value;
    const index = Number(fileMenu.value);
    const test = outputCases[index];
    if (!test) return;
    const verdict = checkResult(test, { output });
    const status = verdict.correct ? "accepted" : verdict.partial ? "partial" : "wrong";
    showResult(resultNode, { status, message: verdict.message, executed: verdict.correct ? [{}] : [] }, [test]);
    if (verdict.correct && !test.optional) {
      completedOutputs.add(index);
      onOutputPass(index, test.input);
      if (outputCases.every((item, i) => item.optional || completedOutputs.has(i) || hasOutputPass(i, item.input))) {
        onPass("output");
        refreshParts();
      }
    }
  });
  import("./judge-tests.js?v=judge2").then(({ testSuites, outputTestSuites }) => {
    if (unmounted) return;
    const suite = testSuites[task.id] ?? [];
    codeCases = task.mode === "outputs" ? [] : suite.filter((test) => !test.optional);
    outputCases = task.mode === "outputs" ? suite : outputTestSuites?.[task.id] ?? [];
    createOptions(fileMenu, outputCases, "Файл");
    fileChanged();
    refresh();
  }).catch(() => {
    if (!unmounted) {
      refresh();
      context.textContent = "Набор тестов не загрузился. Можно обновить страницу или запустить код на своём вводе.";
    }
  });
  refreshParts();
  return {
    refreshParts,
    dispose() {
      unmounted = true;
      active?.cancel();
    },
  };
}
