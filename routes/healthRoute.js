import express from "express";

const router = express.Router();

router.get("/", (_, res) => {
  res.send("🟢 Prop Hunt Server Running");
});

export default router;