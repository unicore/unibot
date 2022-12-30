const { Node } = require('tiptap');

module.exports = class Title extends Node {
  // eslint-disable-next-line class-methods-use-this
  get name() {
    return 'title';
  }

  // eslint-disable-next-line class-methods-use-this
  get schema() {
    return {
      content: 'inline*',
      parseDOM: [
        {
          tag: 'h1',
        },
      ],
      toDOM: () => ['h1', 0],
    };
  }
};
