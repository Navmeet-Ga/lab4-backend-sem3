const EventEmitter = require("events");

const appEvents = new EventEmitter();

appEvents.on("user:registered", ({ email }) => {
  console.log(`[EVENT] New user registered: ${email}`);
});

appEvents.on("note:created", ({ noteId, owner }) => {
  console.log(`[EVENT] Note ${noteId} created by ${owner}`);
});

appEvents.on("chat:message", ({ room, username }) => {
  console.log(`[EVENT] ${username} sent a message in ${room}`);
});

module.exports = appEvents;
