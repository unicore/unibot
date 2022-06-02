const bearerAuthPlugin = require('@fastify/bearer-auth');

const keys = new Set([process.env.TOKEN]);

module.exports.registerAdminAuth = (fastify) => {
  fastify.register(bearerAuthPlugin, { keys });
};
