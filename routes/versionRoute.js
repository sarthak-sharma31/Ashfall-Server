import express from "express";

const router = express.Router();

router.get("/version.json", (_, res) => {
  res.json({
    latestVersion: "1.0.0",
    minSupportedVersion: "1.0.0",
    patchUrl: "https://ashfall-server.up.railway.app/patches/",
    contentManifestUrl: "https://ashfall-server.up.railway.app/patches/manifest.json",
  });
});

export default router;
