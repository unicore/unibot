const axios = require('axios');

module.exports.notifyByEmail = async function notifyByEmail(notifyTo, status) {
  // status:
  // 0 - start
  // 1 - approve
  // 2 - accept
  // 3 - confirm

  await axios.get(`${process.env.REGISTRATOR}/notify`, {
    params: {
      notify_to: notifyTo,
      status,
      signature: 'signature',
    },
  });
};
