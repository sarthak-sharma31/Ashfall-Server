import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    uid: {
        type: String,
        unique: true
    },

    username: {
        type: String,
        default: "Guest"
    },

    level: {
        type: Number,
        default: 1
    },

    xp: {
        type: Number,
        default: 0
    },

    gold: {
        type: Number,
        default: 0
    },

    gems: {
        type: Number,
        default: 0
    },

    tickets: {
        type: Number,
        default: 0
    },

    kills: {
        type: Number,
        default: 0
    },

    deaths: {
        type: Number,
        default: 0
    },

    matchesPlayed: {
        type: Number,
        default: 0
    },

    wins: {
        type: Number,
        default: 0
    },

    character: {
        type: String,
        default: "DefaultSoldier"
    },

    createdAt: {
        type: Date,
        default: Date.now
    },

    // Login
    authTokenHash: {
        type: String,
        default: null
    },

    googleSub: {
        type: String,
        unique: true,
        sparse: true
    },

    email: {
        type: String,
        default: ""
    },

    lastLogin: {
        type: Date
    }
});

export default mongoose.model("Player", playerSchema);
