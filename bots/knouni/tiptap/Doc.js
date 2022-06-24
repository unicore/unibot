const { Doc } = require('tiptap');

module.exports = class CustomDoc extends Doc {
  // eslint-disable-next-line class-methods-use-this
  get schema() {
    return {
      content: 'title* block+',
    };
  }
};
