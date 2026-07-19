// Tiny assertion collector shared by specs. Each spec returns an array of
// { name, ok, expected, actual } that the runner reports on.
function makeAsserter() {
  const results = [];
  return {
    eq(name, actual, expected) {
      results.push({ name, ok: JSON.stringify(actual) === JSON.stringify(expected), expected, actual });
    },
    ok(name, actual) {
      results.push({ name, ok: !!actual, expected: true, actual });
    },
    results,
  };
}
module.exports = { makeAsserter };
