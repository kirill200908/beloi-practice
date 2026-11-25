const CLANG = "https://cdn.jsdelivr.net/npm/@yowasp/clang@22.0.0-git20542-10/gen/bundle.js";
const WASI = "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js";
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const outputLimit = 2 * 1024 * 1024;
const encoder = new TextEncoder();

const standardHeaders = `algorithm array bit bitset cassert cctype cerrno cfloat chrono climits
  cmath complex cstddef cstdint cstdio cstdlib cstring ctime deque exception filesystem forward_list functional iomanip ios
  iostream iterator limits list map memory numbers numeric optional queue random ranges
  regex set span sstream stack stdexcept string string_view tuple type_traits
  unordered_map unordered_set utility valarray variant vector`.trim().split(/\s+/);
const contestHeader = standardHeaders.map((header) => "#include <" + header + ">").join("\n");

class OutputLimitError extends Error {}
class CompilationError extends Error {}

function collector(limit = outputLimit, onChunk) {
  const decoder = new TextDecoder();
  let value = "";
  let size = 0;
  return {
    write(buffer) {
      size += buffer.length;
      if (size > limit) throw new OutputLimitError();
      const chunk = decoder.decode(buffer, { stream: true });
      value += chunk;
      onChunk?.(chunk);
      return buffer.length;
    },
    text() { return value + decoder.decode(); },
  };
}

function inputStream(input, interactor) {
  let bytes = encoder.encode(input);
  let offset = 0;
  return (length) => {
    if (offset === bytes.length && interactor) {
      bytes = encoder.encode(interactor.nextReply());
      offset = 0;
    }
    const slice = bytes.subarray(offset, offset + length);
    offset += slice.length;
    return slice;
  };
}

async function loadCpp(memory, archives) {
  const [clang, wasi, libraries] = await Promise.all([
    import(CLANG),
    import(WASI),
    Promise.all(archives.map(async ([name, archive]) => {
      const stream = new Response(archive).body.pipeThrough(new DecompressionStream("gzip"));
      const bytes = await new Response(stream).arrayBuffer();
      return [name, new Uint8Array(bytes)];
    })).then(Object.fromEntries),
  ]);
  return async (source) => {
    let diagnostics = "";
    const diagnosticDecoder = new TextDecoder();
    let files;
    try {
      files = await clang.runClang([
        "clang++", "-std=c++20", "-O2", "-fwasm-exceptions", "-mllvm", "-wasm-use-legacy-eh=false",
        "-Wl,-z,stack-size=8388608",
        `-Wl,--max-memory=${memory * 1048576}`, "-I.", "solution.cpp", "-o", "solution.wasm",
        "-nostdlib++", "-L.", "-lc++", "-lc++abi", "-lunwind",
      ], { ...libraries, "solution.cpp": source, bits: { "stdc++.h": contestHeader } }, {
        stdout: null,
        stderr: (chunk) => {
          if (chunk && diagnostics.length < 12000) {
            diagnostics += typeof chunk === "string" ? chunk : diagnosticDecoder.decode(chunk, { stream: true });
          }
        },
      });
    } catch (error) {
      throw new CompilationError(diagnostics.trim() || String(error));
    }
    if (!files["solution.wasm"]) throw new CompilationError(diagnostics.trim() || "Компилятор не создал программу.");
    const program = await WebAssembly.compile(files["solution.wasm"]);
    return async (input, interactor) => {
      const stderr = collector();
      const stdout = collector(outputLimit, interactor?.receive);
      const read = inputStream(input, interactor);
      const stdin = new wasi.OpenFile(new wasi.File(encoder.encode(input)));
      if (interactor) {
        stdin.fd_read = (size) => ({ ret: 0, data: read(size) });
      }
      const host = new wasi.WASI(["solution"], [], [
        stdin, new wasi.ConsoleStdout((data) => stdout.write(data)),
        new wasi.ConsoleStdout((data) => stderr.write(data)),
      ]);
      try {
        const instance = await WebAssembly.instantiate(program, { wasi_snapshot_preview1: host.wasiImport });
        const code = host.start(instance);
        return { output: stdout.text(), detail: stderr.text(), code };
      } catch (error) {
        if (error instanceof OutputLimitError) throw error;
        return { output: stdout.text(), detail: stderr.text() || String(error), code: 1 };
      }
    };
  };
}

async function loadPython() {
  const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
  const python = await loadPyodide({ indexURL: PYODIDE });
  return (source) => {
    const scope = python.globals.get("dict")();
    scope.set("_source", source);
    try {
      python.runPython(`import io as _io
import sys as _sys

_code = compile(_source, 'solution.py', 'exec')
def _run():
    previous = (_sys.stdin, _sys.stdout, _sys.stderr, _sys.__stdin__, _sys.__stdout__, _sys.__stderr__)
    stdin = _io.open(0, "r", encoding="utf-8", closefd=False)
    stdout = _io.open(1, "w", encoding="utf-8", buffering=1, closefd=False)
    stderr = _io.open(2, "w", encoding="utf-8", buffering=1, closefd=False)
    _sys.stdin = _sys.__stdin__ = stdin
    _sys.stdout = _sys.__stdout__ = stdout
    _sys.stderr = _sys.__stderr__ = stderr
    try:
        exec(_code, {'__name__': '__main__', '__file__': 'solution.py'})
    except SystemExit as error:
        if error.code not in (None, 0):
            raise
    finally:
        try:
            if not stdout.closed:
                stdout.flush()
            if not stderr.closed:
                stderr.flush()
        finally:
            _sys.stdin, _sys.stdout, _sys.stderr, _sys.__stdin__, _sys.__stdout__, _sys.__stderr__ = previous
`, { globals: scope });
    } catch (error) {
      scope.destroy();
      throw new CompilationError(String(error));
    }
    return (input, interactor) => {
      const stdout = collector(outputLimit, interactor?.receive);
      const stderr = collector();
      const read = inputStream(input, interactor);
      python.setStdin({ read(buffer) {
        const next = read(buffer.length);
        buffer.set(next);
        return next.length;
      }, isatty: false });
      python.setStdout({ write: (data) => stdout.write(data), isatty: false });
      python.setStderr({ write: (data) => stderr.write(data), isatty: false });
      try {
        python.runPython("_run()", { globals: scope, filename: "runner.py" });
        return { output: stdout.text(), detail: stderr.text(), code: 0 };
      } catch (error) {
        if (error instanceof OutputLimitError) throw error;
        return { output: stdout.text(), detail: stderr.text() || String(error), code: 1 };
      }
    };
  };
}

function comparisonInteractor(input, permutationText) {
  const [length, deletions] = input.trim().split(/\s+/).map(Number);
  const values = permutationText.trim().split(/\s+/).map(Number);
  const maximum = length + 20 * deletions;
  let queries = 0;
  let pending = "";
  let replies = "";
  let answered = false;
  let error = "";

  function receive(chunk) {
    pending += chunk;
    let end;
    while ((end = pending.indexOf("\n")) !== -1) {
      const tokens = pending.slice(0, end).trim().split(/\s+/);
      pending = pending.slice(end + 1);
      if (!tokens[0]) continue;
      const numbers = tokens.slice(1).map(Number);
      if (error) continue;
      if (answered) error = "Программа продолжила диалог после ответа.";
      else if (tokens[0] === "!" && numbers.length === length) {
        answered = true;
        if (values.some((number, i) => number !== numbers[i])) error = "Перестановка угадана неверно.";
      } else if (tokens[0] === "?" && numbers.length === 2
        && numbers.every((x) => Number.isInteger(x) && x >= 1 && x <= length)) {
        queries++;
        if (queries > maximum) error = "Превышено число запросов.";
        else replies += (values[numbers[0] - 1] < values[numbers[1] - 1] ? "1\n" : "0\n");
      } else {
        error = "Команда не соответствует формату протокола.";
      }
    }
  }

  return {
    receive,
    nextReply() {
      if (!replies) {
        error ||= "Программа ждёт ответ без завершённого запроса. Проверь сброс вывода.";
        return "-1\n";
      }
      const response = replies;
      replies = "";
      return response;
    },
    verdict() {
      if (pending.trim()) receive("\n");
      return error || (!answered ? "Программа завершилась без ответа." : "");
    },
  };
}

addEventListener("message", async (event) => {
  const report = event.ports[0].postMessage.bind(event.ports[0]);
  const { language, source, cases, memory = 256, archives } = event.data;
  let compile;
  try {
    report({ type: "phase", phase: "load" });
    compile = await (language === "cpp" ? loadCpp(memory, archives) : loadPython());
  } catch (error) {
    report({ type: "problem", message: "Не удалось загрузить среду. " + String(error).slice(0, 1200) });
    return;
  }
  let run;
  try {
    report({ type: "phase", phase: "compile" });
    run = await compile(source);
  } catch (error) {
    const type = error instanceof CompilationError ? "compile-error" : "problem";
    report({ type, message: String(error.message || error).slice(0, 14000) });
    return;
  }
  for (const [index, test] of cases.entries()) {
    report({ type: "phase", phase: "run", index });
    try {
      const interactor = test.checker === "permutation-interactive" ? comparisonInteractor(test.input, test.output) : null;
      const start = performance.now();
      const result = await run(test.input, interactor);
      report({ type: "case", index, ...result, interactiveError: interactor?.verdict(), ms: performance.now() - start });
    } catch (error) {
      report({ type: "case-error", index, outputLimit: error instanceof OutputLimitError, message: String(error).slice(0, 2000) });
    }
  }
  report({ type: "done" });
}, { once: true });
