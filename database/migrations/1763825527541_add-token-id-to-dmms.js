/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // First, add the column as nullable
  pgm.addColumn('dmms', {
    token_id: {
      type: 'varchar(50)',
      notNull: false,
      comment: 'Hedera token ID used to calculate votes',
    },
  });
  
  // Update existing rows with a placeholder value (you may want to update this with actual token IDs)
  pgm.sql('UPDATE dmms SET token_id = \'0.0.0\' WHERE token_id IS NULL');
  
  // Now make it NOT NULL
  pgm.alterColumn('dmms', 'token_id', {
    notNull: true,
  });
};

exports.down = pgm => {
  pgm.dropColumn('dmms', 'token_id');
};
