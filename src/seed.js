require('dotenv').config();
const db = require('./db');
const User = require('./models/User');
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const { hashPassword } = require('./auth');

async function seed() {
  console.log('Seeding demo data...');

  const existing = User.findByEmail('alice@example.com');
  if (existing) {
    console.log('Demo data already present. Skipping.');
    return;
  }

  const alice = User.create({
    username: 'alice',
    email: 'alice@example.com',
    passwordHash: await hashPassword('password123'),
  });
  const bob = User.create({
    username: 'bob',
    email: 'bob@example.com',
    passwordHash: await hashPassword('password123'),
  });

  const conversation = Conversation.createDirect(alice.id, bob.id);
  Message.create({ conversationId: conversation.id, senderId: alice.id, body: 'Hey Bob!' });
  Message.create({ conversationId: conversation.id, senderId: bob.id, body: 'Hey Alice, welcome to Wire.' });

  console.log('Seed complete.');
  console.log('  alice@example.com / password123');
  console.log('  bob@example.com   / password123');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.close());
