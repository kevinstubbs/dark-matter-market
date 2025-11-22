/* eslint-disable camel_case */

exports.up = (pgm) => {
  // DMMs table - stores Dark Matter Market information
  pgm.createTable('dmms', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    topic_id: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
      comment: 'Hedera topic ID',
    },
    chain_id: {
      type: 'integer',
      notNull: true,
      comment: 'Chain ID (296 for Hedera testnet, 295 for Hedera mainnet)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Proposals table - stores DMM proposals
  pgm.createTable('proposals', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    dmm_id: {
      type: 'integer',
      notNull: true,
      references: 'dmms(id)',
      onDelete: 'CASCADE',
    },
    description: {
      type: 'text',
      notNull: true,
    },
    voting_deadline: {
      type: 'timestamp',
      notNull: true,
    },
    quorum: {
      type: 'bigint',
      notNull: true,
      comment: 'Minimum number of votes required for proposal to pass',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'active',
      check: "status IN ('active', 'passed', 'failed', 'expired')",
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create indexes for better query performance
  pgm.createIndex('proposals', 'dmm_id');
  pgm.createIndex('proposals', 'voting_deadline');
  pgm.createIndex('proposals', 'status');
};

exports.down = (pgm) => {
  pgm.dropTable('proposals');
  pgm.dropTable('dmms');
};
