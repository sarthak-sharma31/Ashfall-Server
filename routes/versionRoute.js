import express from "express";

const router = express.Router();

// What the game's loading screen checks on every launch. Change these on Railway (Variables), no code needed:
//   LATEST_VERSION  newest app version (players below it see "New version available" / get a background update)
//   MIN_VERSION     oldest version still allowed to play (below it the game forces an update)
//   STORE_URL       where the UPDATE button sends players who can't update through Google Play
router.get("/version.json", (_, res) => {
  res.set("Cache-Control", "no-cache");
  res.json({
    latestVersion: process.env.LATEST_VERSION || "1.0.0",
    minSupportedVersion: process.env.MIN_VERSION || "1.0.0",
    storeUrl: process.env.STORE_URL || "",
    patchUrl: "https://ashfall-server.up.railway.app/patches/",
    contentManifestUrl: "https://ashfall-server.up.railway.app/patches/manifest.json",
  });
});

export default router;
