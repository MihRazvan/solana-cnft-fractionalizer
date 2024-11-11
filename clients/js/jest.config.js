require('dotenv').config();

process.env.ANCHOR_WALLET = '/Users/razvanmihailescu/.config/solana/id.json';
process.env.ANCHOR_PROVIDER_URL = 'http://localhost:8899';

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    transform: {
        '^.+\\.tsx?$': 'ts-jest'
    },
    setupFiles: ['dotenv/config']
};
