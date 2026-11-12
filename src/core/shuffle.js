const crypto = require("node:crypto");

// Fisher–Yates với nguồn ngẫu nhiên mật mã học, trả về mảng mới.
function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Kế hoạch riêng của một người chơi: thứ tự câu hỏi và thứ tự đáp án trong từng câu.
// plan[r - 1] = { qIndex, optionOrder } — optionOrder[i] là khoá GỐC (A–D trong questions.json)
// của phương án được hiển thị ở vị trí thứ i (vị trí 0 hiển thị là "A", 1 là "B"...).
function buildPlan(questionCount, optionKeys) {
  const order = shuffle(Array.from({ length: questionCount }, (_, i) => i));
  return order.map(qIndex => ({ qIndex, optionOrder: shuffle(optionKeys) }));
}

module.exports = { shuffle, buildPlan };
