/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  // Create junction table for DMM tokens (many-to-many relationship)
  pgm.createTable('dmm_tokens', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    dmm_id: {
      type: 'integer',
      notNull: true,
      references: 'dmms(id)',
      onDelete: 'CASCADE',
      comment: 'Reference to the DMM',
    },
    token_id: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'Hedera token ID used to calculate votes',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create unique constraint to prevent duplicate token associations
  pgm.addConstraint('dmm_tokens', 'dmm_tokens_dmm_id_token_id_unique', {
    unique: ['dmm_id', 'token_id'],
  });

  // Create indexes for better query performance
  pgm.createIndex('dmm_tokens', 'dmm_id');
  pgm.createIndex('dmm_tokens', 'token_id');

  // Migrate existing token_id data from dmms table to dmm_tokens
  pgm.sql(`
    INSERT INTO dmm_tokens (dmm_id, token_id)
    SELECT id, token_id
    FROM dmms
    WHERE token_id IS NOT NULL AND token_id != '0.0.0'
  `);

  // Drop the token_id column from dmms table
  pgm.dropColumn('dmms', 'token_id');
};

exports.down = pgm => {
  // Add token_id column back to dmms
  pgm.addColumn('dmms', {
    token_id: {
      type: 'varchar(50)',
      notNull: false,
      comment: 'Hedera token ID used to calculate votes',
    },
  });

  // Migrate data back (taking the first token for each DMM)
  pgm.sql(`
    UPDATE dmms d
    SET token_id = (
      SELECT token_id
      FROM dmm_tokens dt
      WHERE dt.dmm_id = d.id
      ORDER BY dt.created_at ASC
      LIMIT 1
    )
  `);

  // Set default for DMMs without tokens
  pgm.sql(`UPDATE dmms SET token_id = '0.0.0' WHERE token_id IS NULL`);

  // Make it NOT NULL
  pgm.alterColumn('dmms', 'token_id', {
    notNull: true,
  });

  // Drop the junction table
  pgm.dropTable('dmm_tokens');
};

