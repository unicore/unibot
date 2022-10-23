const { registerAdminAuth } = require('../../../common/adminAuth');
const Chats = require('../controllers/chats');
const Quiz = require('../controllers/quiz');
const Users = require('../controllers/users');
const Payments = require('../controllers/payments');

module.exports = (fastify, opts, done) => {
  registerAdminAuth(fastify);

  fastify.post('/quiz/get-requests', Quiz.getRequests);
  fastify.post('/users/send-message', Users.sendMessage);
  fastify.post('/chats/get-chat', Chats.getChat);
  fastify.post('/payments/pay-reciever', Payments.payReciever);
  done();
};
