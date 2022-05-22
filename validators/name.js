const nameRegex = /^[\w\d]+$/gi;

module.exports.validateName = (str) => nameRegex.test(str);
