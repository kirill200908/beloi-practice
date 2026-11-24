function tokens(value) {
  return value.trim().match(/\S+/g) ?? [];
}

class OutputTokens {
  constructor(value) {
    this.values = tokens(value);
    this.index = 0;
  }

  word() {
    if (this.index === this.values.length) throw new Error("Вывод закончился раньше времени.");
    return this.values[this.index++];
  }

  bigint() {
    const word = this.word();
    if (!/^[+-]?\d{1,30}$/.test(word)) throw new Error("Ожидалось целое число.");
    return BigInt(word);
  }

  integer(min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
    const value = Number(this.bigint());
    if (value < min || value > max) throw new Error("Число вне допустимых границ.");
    return value;
  }

  finish() {
    if (this.index !== this.values.length) throw new Error("В выводе есть лишние данные.");
  }
}

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function matrixSwap(input, expected, reply) {
  const reference = new OutputTokens(expected);
  const count = input.integer();
  for (let tc = 0; tc < count; tc++) {
    const height = input.integer();
    const width = input.integer();
    const a = Array.from({ length: height }, () => Array.from({ length: width }, () => input.bigint()));
    const possible = reference.word().toUpperCase() === "YES";
    if (possible) for (let i = 0; i < 4; i++) reference.integer();
    const decision = reply.word().toUpperCase();
    if (decision === "NO") {
      requireValid(!possible, `Таблицу №${tc + 1} можно уравнять.`);
      continue;
    }
    requireValid(decision === "YES", "Ожидалось YES или NO.");
    const row1 = reply.integer(1, height) - 1;
    const column1 = reply.integer(1, width) - 1;
    const row2 = reply.integer(1, height) - 1;
    const column2 = reply.integer(1, width) - 1;
    [a[row1][column1], a[row2][column2]] = [a[row2][column2], a[row1][column1]];
    const rowSum = (row) => row.reduce((sum, n) => sum + n, 0n);
    const value = rowSum(a[0]);
    const columns = Array(width).fill(0n);
    for (const row of a) {
      requireValid(rowSum(row) === value, `Таблица №${tc + 1}: суммы строк отличаются.`);
      for (let col = 0; col < width; col++) columns[col] += row[col];
    }
    requireValid(columns.every((sum) => sum === value), `Таблица №${tc + 1}: суммы столбцов или строк отличаются.`);
  }
}

function distinct(input, reply) {
  const count = input.integer();
  for (let tc = 0; tc < count; tc++) {
    const size = input.integer();
    const limit = input.integer();
    const a = Array.from({ length: size }, () => input.bigint());
    const operations = reply.integer(0, limit);
    for (let i = 0; i < operations; i++) {
      const to = reply.integer(1, size) - 1;
      const from = reply.integer(1, size) - 1;
      requireValid(to !== from, "В одной операции нужны два разных индекса.");
      a[to] += a[from];
      requireValid(a[to] >= -1000000000000000000n && a[to] <= 1000000000000000000n, "После операции превышено ограничение 10¹⁸.");
    }
    requireValid(new Set(a).size === a.length, `В наборе №${tc + 1} остались одинаковые числа.`);
  }
}

function binaryPalindrome(input, reply) {
  const length = input.integer();
  let value = input.word();
  const x = input.word();
  const operations = reply.integer(0, length);
  for (let i = 0; i < operations; i++) {
    const type = reply.integer(1, 2);
    const first = reply.integer(0, value.length);
    const second = reply.integer(first, value.length);
    const third = reply.integer(second, value.length);
    const [a, b, c] = type === 1 ? "110" : "0" + x + "1";
    value = value.slice(0, first) + a + value.slice(first, second) + b + value.slice(second, third) + c + value.slice(third);
  }
  requireValid([...value].every((char, index) => char === value[value.length - 1 - index]), "После вставок строка не стала палиндромом.");
}

function arithmeticPermutation(input, reply) {
  input.integer();
  const target = input.bigint();
  const minimum = input.integer();
  const maximum = input.integer();
  const weight = Number(input.word());
  const length = reply.integer(minimum, maximum);
  const permutation = Array.from({ length }, () => reply.integer(1, length));
  requireValid(new Set(permutation).size === length, "Ответ должен быть перестановкой без повторяющихся чисел.");
  const endings = permutation.map(() => new Map());
  let count = 0n;
  for (let j = 0; j < length; j++) {
    for (let i = 0; i < j; i++) {
      const delta = permutation[j] - permutation[i];
      const shorter = endings[i].get(delta) ?? 0n;
      endings[j].set(delta, shorter + 1n);
      count += shorter;
    }
  }
  const correct = count === target;
  const small = count < target ? count : target;
  const large = count < target ? target : count;
  const ratio = Number((small + 1n) * (10n ** 15n) / (large + 1n)) / 1e15;
  const points = correct ? 4 : Math.max(weight > 0 ? 0.01 : 0, Math.ceil((100 * weight * ratio ** 3) - 1e-12) / 100);
  return {
    correct,
    partial: !correct && points > 0,
    message: `Прогрессий ${count} из ${target}. Баллы за этот тест: ${points.toLocaleString("ru", { minimumFractionDigits: 2 })} из 4.`,
  };
}

function orchardConstruction(input, reply) {
  input.integer();
  const length = input.integer();
  const maxValue = input.integer();
  const levels = input.integer() + 1;
  const bounds = Array.from({ length: levels }, () => input.bigint());
  const marks = Array.from({ length: levels }, () => Number(input.word()));
  const values = Array.from({ length }, () => reply.integer(1, maxValue));
  const minByLeft = Array(length).fill(Number.POSITIVE_INFINITY);
  let beauty = 0n;
  for (let right = 1; right < length; right++) {
    let newMinimum = Number.POSITIVE_INFINITY;
    for (let left = right - 1; left >= 0; left--) {
      newMinimum = Math.min(newMinimum, values[left] ^ values[right]);
      minByLeft[left] = Math.min(minByLeft[left], newMinimum);
      beauty += BigInt(minByLeft[left]);
    }
  }
  const maximum = marks.at(-1);
  const above = bounds.findIndex((bound) => bound > beauty);
  const score = above === -1 ? maximum : marks[above - 1] + (marks[above] - marks[above - 1])
    * Number(beauty - bounds[above - 1]) / Number(bounds[above] - bounds[above - 1]);
  const points = Math.ceil(score * 100 - 1e-9) / 100;
  return {
    correct: above === -1,
    partial: above !== -1 && points > 0,
    message: `Суммарная красота: ${beauty}. Баллы за этот тест: ${points.toLocaleString("ru", { minimumFractionDigits: 2 })} из ${maximum.toLocaleString("ru")}.`,
  };
}

export function checkResult(test, result) {
  if (test.checker === "permutation-interactive") {
    return { correct: !result.interactiveError, message: result.interactiveError };
  }
  if (!test.checker) {
    const actual = tokens(result.output);
    const expected = tokens(test.output);
    return { correct: actual.length === expected.length && actual.every((value, i) => value === expected[i]) };
  }
  try {
    const input = new OutputTokens(test.input);
    const reply = new OutputTokens(result.output);
    let verdict = { correct: true };
    switch (test.checker) {
      case "matrix-swap": matrixSwap(input, test.output, reply); break;
      case "distinct": distinct(input, reply); break;
      case "binary-palindrome": binaryPalindrome(input, reply); break;
      case "arithmetic-permutation": verdict = arithmeticPermutation(input, reply); break;
      case "orchard-construction": verdict = orchardConstruction(input, reply); break;
      default: throw new Error("Для этого формата пока нет валидатора.");
    }
    reply.finish();
    return verdict;
  } catch (error) {
    return { correct: false, message: error.message };
  }
}
