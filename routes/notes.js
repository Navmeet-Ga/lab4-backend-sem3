const express = require("express");
const { ObjectId } = require("mongodb");
const { getDb } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const appEvents = require("../utils/events");

const router = express.Router();
router.use(authenticateToken);

function validId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

// Create a note
router.post("/", async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ message: "title and content are required" });

    const note = {
      title: String(title).trim(),
      content: String(content),
      owner: req.user.sub,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await getDb().collection("notes").insertOne(note);
    appEvents.emit("note:created", { noteId: result.insertedId.toString(), owner: req.user.email });
    res.status(201).json({ message: "Note created successfully", note: { _id: result.insertedId, ...note } });
  } catch (error) { next(error); }
});

// List only the logged-in user's notes
router.get("/", async (req, res, next) => {
  try {
    const notes = await getDb().collection("notes")
      .find({ owner: req.user.sub }).sort({ updatedAt: -1 }).toArray();
    res.json({ count: notes.length, notes });
  } catch (error) { next(error); }
});

// Read one owned note
router.get("/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid note ID" });
    const note = await getDb().collection("notes").findOne({
      _id: new ObjectId(req.params.id), owner: req.user.sub
    });
    if (!note) return res.status(404).json({ message: "Note not found" });
    res.json({ note });
  } catch (error) { next(error); }
});

// Update one owned note
router.put("/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid note ID" });
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ message: "title and content are required" });

    const result = await getDb().collection("notes").findOneAndUpdate(
      { _id: new ObjectId(req.params.id), owner: req.user.sub },
      { $set: { title: String(title).trim(), content: String(content), updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) return res.status(404).json({ message: "Note not found" });
    res.json({ message: "Note updated successfully", note: result });
  } catch (error) { next(error); }
});

// Delete one owned note
router.delete("/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid note ID" });
    const result = await getDb().collection("notes").deleteOne({
      _id: new ObjectId(req.params.id), owner: req.user.sub
    });
    if (!result.deletedCount) return res.status(404).json({ message: "Note not found" });
    res.json({ message: "Note deleted successfully" });
  } catch (error) { next(error); }
});

module.exports = router;
