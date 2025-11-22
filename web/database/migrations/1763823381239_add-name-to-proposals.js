/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addColumn('proposals', {
    name: {
      type: 'varchar(255)',
      notNull: true,
      default: 'Untitled Proposal',
    },
  });
};

exports.down = pgm => {
  pgm.dropColumn('proposals', 'name');
};
