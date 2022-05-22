const tokenRegex = /^\d{9,11}:[\w\d_-]{35}$/gi;

module.exports.validateToken = (str) => tokenRegex.test(str);
