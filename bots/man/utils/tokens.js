module.exports.parseTokenString = function parseTokenString(tokenString) {
  const [amountString, symbol] = tokenString.split(' ');
  const [, pr] = amountString.split('.');
  const precision = pr.length;
  const amount = parseFloat(amountString);
  return { amount, symbol, precision };
};
